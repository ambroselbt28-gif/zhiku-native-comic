// 使用合成漫画校验源码、实际发布代码和 NovelAI 请求。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as original from '../src/comic.js';

const runtime = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const generated = vm.runInNewContext(
    runtime.slice(runtime.indexOf('const COMIC_BLOCK'), runtime.indexOf('// The entire editable instruction'))
        + '\n({parseComicPage, comicRequest, comicBlocks, createComicController, isComicReply})',
    { console, setTimeout, clearTimeout, structuredClone },
);
const page = `@page
comic page, 2 panels, vertical layout
Text: 雨天
@panel P1
top half, cafe interior
Text: 两分钟后
@character C1
boy, black hair, white shirt, holding a cup
Text: 「早上好，保留标点！」
@negative
long hair
@panel P2
bottom half, garden, close-up
@character C1
boy, black hair, white shirt, smiling
Text: 「雨停了。」`;

for (const [label, code] of [['源码', original], ['发布代码', generated]]) {
    const parsed = code.parseComicPage(page);
    const request = code.comicRequest(parsed, { stylePos: 'artist:fixture, no text' });
    assert.match(request.positive, /Panel 1 \(P1\): top half, cafe interior/);
    assert.match(request.positive, /Panel 2 \(P2\): bottom half, garden, close-up/);
    assert.match(request.positive, /Text: 雨天/);
    assert.match(request.positive, /Panel 1 \(P1\): 两分钟后/);
    assert(!request.positive.includes('no text'));
    assert(!request.positive.includes('早上好'));
    assert.match(request.chars[0].prompt, /panel 1 \(P1\) only/);
    assert.match(request.chars[1].prompt, /panel 2 \(P2\) only/);
    assert(request.chars[0].prompt.endsWith('Text: 「早上好，保留标点！」'));
    assert.equal(request.chars[0].uc, 'long hair');
    assert(!/@(?:page|panel|character|negative)\b/.test(JSON.stringify(request)));
    for (const textMode of ['overlay', 'none']) {
        const visual = code.comicRequest(parsed, { textMode });
        assert(!/雨天|两分钟后|早上好|雨停了|Text:/.test(JSON.stringify(visual)));
        assert.match(visual.negative, /speech bubble/);
    }
    const json = code.parseComicPage(JSON.stringify({
        format: 'nai5-comic', page: { base: 'comic, 1 panel' },
        panels: [{ id: 'P1', description: 'top half, train', characters: [{ character_id: 'C1', positive: 'girl, coat' }] }],
    }));
    assert.match(code.comicRequest(json).chars[0].prompt, /panel 1 \(P1\) only/);
    const hidden = { name: '测试角色', is_system: true, mes: 'A person opens a cafe in the rain.' };
    assert(code.isComicReply(hidden));
    for (const message of [null, { is_user: true }, { is_system: true, name: 'System' },
        { ...hidden, extra: { type: 'narrator' } }, { ...hidden, extra: { tool_invocations: [] } }]) {
        assert(!code.isComicReply(message));
    }
    let asks = 0, draws = 0, saves = 0;
    const context = { chatId: 'synthetic', chat: [hidden], saveChat: async () => { saves++; } };
    const doc = {
        defaultView: { setTimeout, clearTimeout }, head: { appendChild() {} },
        createElement: () => ({ remove() {} }), querySelector: () => null, querySelectorAll: () => [],
        addEventListener() {}, removeEventListener() {},
    };
    const controller = code.createComicController({
        document: doc, getContext: () => context, getData: () => ({ options: { comicOn: true, comicAuto: true } }),
        askLLM: async () => { asks++; return `<image>${page}</image>`; },
        generatePage: async req => { draws++; assert.match(req.chars[0].prompt, /Text:/); return { image: 'mock-image' }; },
        storeImage: async () => ({ url: 'synthetic.png' }), notify() {}, esc: String,
    });
    await controller.process(0);
    assert.equal(asks, 0, label + '隐藏楼层保持手动触发');
    await controller.adapt(0);
    assert.equal(asks, 1);
    assert.equal(draws, 1);
    assert.equal(saves, 2);
    assert.equal(hidden.is_system, true);
    assert.equal(hidden.mes, 'A person opens a cafe in the rain.');
    assert(hidden.extra.zhikuComicSrc['0']);
    await controller.generateOne(0, code.comicBlocks(`<image>${page}</image>`)[0]);
    assert.equal(draws, 2);
    assert.equal(Object.values(hidden.extra.zhikuComic)[0].versions.length, 2);
    controller.stop();
    const tooMany = code.parseComicPage('@page\ncomic\n@panel P1\npark\n'
        + Array.from({ length: 23 }, (_, i) => `@character C${i}\nboy, coat`).join('\n'));
    assert.throws(() => code.comicRequest(tooMany), /22/);
    console.log('PASS ' + label + ' 原生画格、人物对白、旧格式、隐藏楼手动入口与重画版本');
}

const config = {
    naiMode: 'site', naiSite: 'https://fixture.invalid', naiSiteKey: 'fixture-private-key',
    novelaimode: 'nai-diffusion-4-5-full', novelai_seed: 123,
};
const requests = [], logs = [];
let statuses = [];
const start = runtime.indexOf('const __mod_nai =');
const end = runtime.indexOf('const __mod_engine =', start);
const nai = vm.runInNewContext(runtime.slice(start, end) + '\n__mod_nai', {
    __shim: { extension_settings: { piaoce_nai: config }, getRequestHeaders: () => ({}), saveSettingsDebounced() {} },
    setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {},
    TextDecoder, TextEncoder, Uint8Array, btoa: value => Buffer.from(value, 'binary').toString('base64'),
    toastr: { info() {} }, __zkLog: (...entry) => logs.push(entry),
    fetch: async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url, body });
        const status = statuses.shift() ?? 200;
        return {
            ok: status === 200, status, headers: { get: () => null },
            text: async () => 'synthetic error',
            arrayBuffer: async () => status === 200 ? new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer
                : new TextEncoder().encode('synthetic server error').buffer,
        };
    },
});
const chars = Array.from({ length: 8 }, (_, index) => ({
    prompt: `boy, coat, panel ${index + 1}\nText: 「第 ${index + 1} 格。」`,
    uc: 'bad hands', center: { x: 0.68, y: 0.46 },
}));
await nai.generate({ positive: 'comic page, 8 panels', chars, comic: true });
let sent = requests.at(-1).body;
assert.equal(sent.model, 'nai-diffusion-5-full');
assert.equal(sent.action, 'generate');
assert.equal(sent.parameters.v4_prompt.caption.char_captions.length, 8);
assert.equal(sent.parameters.v4_negative_prompt.caption.char_captions.length, 8);
assert.equal(sent.parameters.v4_prompt.caption.char_captions[7].centers[0].x, 0.68);
assert(sent.parameters.v4_prompt.caption.char_captions[7].char_caption.endsWith('Text: 「第 8 格。」'));
assert(logs.some(entry => entry[0] === '漫画请求' && entry[2].includes('第 8 格')));
assert(!JSON.stringify(logs).includes('fixture-private-key'));
const literal = nai.buildParameters({ positive: 'comic', comic: true,
    chars: [{ prompt: '1girl, coat\nText: 「1girl, 1boy 是两个标签。」' }] });
assert(literal.v4_prompt.caption.char_captions[0].char_caption.startsWith('girl, coat'));
assert(literal.v4_prompt.caption.char_captions[0].char_caption.endsWith('Text: 「1girl, 1boy 是两个标签。」'));
const before = requests.length;
statuses = [500, 502, 503];
await assert.rejects(() => nai.generate({ positive: 'comic', chars, comic: true }));
assert.equal(requests.length - before, 3);
assert(requests.slice(before).every(entry => entry.body.parameters.v4_prompt.caption.char_captions.length === 8));
await nai.generate({ positive: 'ordinary illustration', chars });
sent = requests.at(-1).body;
assert.equal(sent.model, 'nai-diffusion-4-5-full');
assert.equal(sent.parameters.v4_prompt.caption.char_captions.length, 6);
nai.stopQueue();
console.log('PASS 正式发布入口 → NAI5 请求体、8 人物保留、坐标、诊断、重试与普通插图兼容');

const notices = [];
const click = runtime.slice(runtime.indexOf('function onChatClick(ev)'), runtime.indexOf('function addMenuButton()'));
const clickHost = { N: { isReady: () => true }, toastr: { warning: text => notices.push(text), error: text => notices.push(text) } };
const onClick = vm.runInNewContext(click + '\nonChatClick', clickHost);
const bookButton = { closest: () => ({ getAttribute: () => '79' }) };
const clickEvent = { target: { closest: selector => selector === '.pc-mes-comic' ? bookButton : null }, stopPropagation() {} };
onClick(clickEvent);
assert(notices[0].includes('尚未就绪'));
clickHost.__zhikuComic = { adapt: async () => { throw Error('synthetic failure'); } };
onClick(clickEvent);
await new Promise(resolve => setImmediate(resolve));
assert(notices.includes('synthetic failure'));
console.log('PASS 楼层入口的未就绪及异步错误反馈');
