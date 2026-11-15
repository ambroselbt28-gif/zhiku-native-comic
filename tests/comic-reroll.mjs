// 用完整合成楼层验证一键整楼重画和按剧情拆多页。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createNaiGate} from '../src/nai-gate.js';
import * as original from '../src/comic.js';

const runtime = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const control=createNaiGate({gap:0});globalThis.__zhikuGenerationControl=control;
const generated = vm.runInNewContext(runtime.slice(runtime.indexOf('const COMIC_BLOCK'), runtime.indexOf('// The entire editable instruction'))
    + '\n({createComicController,comicBlocks,adaptRequest,parseAdapt})', { console, setTimeout, clearTimeout, __zhikuGenerationControl:control });
const page = scene => `<comic_plan>剧情片段 ${scene}，两格</comic_plan>\n<image>@page
comic page, 2 panels, warm lighting
@panel P1
top half, ${scene}, wide shot
@character C1
boy, black hair, white shirt, holding a book
Text: 「早上好。」
@panel P2
bottom half, ${scene}, close-up
@character C1
boy, black hair, white shirt, smiling
Text: 「出发吧。」</image>`;
const source = ['cafe', 'street', 'library'].map(page).join('\n\n');
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function setup(code, inline = false) {
    const requests = [], notices = [], dropped = [];
    let asks = 0, saves = 0, barrier = null, failure = -1, saveFailure = -1;
    const msg = { name: '合成角色', is_system: true, swipe_id: 0, mes: inline ? source : '<content>角色在咖啡馆等雨，雨停后走上街道，随后来到图书馆。</content>', extra: { keep: 'existing', zhikuComicSrc: { 0: source, 1: page('other-candidate') }, zhikuComic: {} } };
    const blocks = code.comicBlocks(source);
    for (const block of blocks) msg.extra.zhikuComic[block.key] = { cur: 0, versions: [{ url: `old-${block.page}.png`, seed: 42 }] };
    let context = { chatId: 'reroll-fixture', chat: [msg], saveChat: async () => { saves++; if (saves === saveFailure) throw Error('合成保存失败'); } };
    const doc = { defaultView: { setTimeout, clearTimeout }, head: { appendChild() {} }, createElement: () => ({ remove() {} }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
    const controller = code.createComicController({
        document: doc, getContext: () => context, getData: () => ({ options: {} }), esc: String,
        askLLM: async () => { asks++; return source; },
        generatePage: async request => { requests.push(request); if (barrier) await barrier; if (requests.length === failure) throw Error('合成第 2 页失败'); return { image: 'synthetic', sent: { seed: request.seed } }; },
        storeImage: async () => ({ url: `new-${requests.length}.png` }), notify: text => notices.push(text), dropImage: url => dropped.push(url),
    });
    return { controller, msg, blocks, requests, notices, dropped,
        get asks() { return asks; }, get saves() { return saves; },
        hold(value) { barrier = value; }, failAt(value) { failure = value; }, failSaveAt(value) { saveFailure = value; },
        switchChat() { context = { ...context, chatId: 'different', chat: [{ name: '另一个角色', mes: '另一段正文' }] }; controller.renderAll({ chatChanged: true }); },
    };
}
for (const [label, code] of [['源码', original], ['发布代码', generated]]) {
    {
        const h=setup(code),wait=defer();h.hold(wait.promise);
        const task=h.controller.redrawAll(0);assert.equal(h.requests.length,1);
        control.cancelPending();wait.resolve();const result=await task;
        assert.equal(h.requests.length,1,'取消后不得继续其他漫画页');
        assert.equal(result.success,1,'保留当前页成功结果');
        assert.equal(h.msg.extra.zhikuComic[h.blocks[0].key].versions.length,2);
        h.hold(null);await h.controller.redrawAll(0);assert.equal(h.requests.length,4,'新的手动重画正常工作');h.controller.stop();
    }
    const planning = code.adaptRequest('先等雨，再出门，最后进图书馆。');
    assert.match(planning.system, /每个剧情片段单独画一页/);
    assert.match(planning.user, /多个剧情片段必须输出多组/);
    assert.equal(code.comicBlocks(planning.system.slice(planning.system.indexOf('多页格式示例'))).length, 2, '提示词含两个独立剧情的多页示例');
    assert.equal(code.comicBlocks(code.parseAdapt(source)).length, 3);
    assert.throws(() => code.parseAdapt(source + '\n<image>@page\nunfinished'), /没有写完/);
    assert.throws(() => code.parseAdapt(source + '\n<comic_plan>下一段剧情</comic_plan>'), /没有写完/);

    for (const inline of [false, true]) {
        const h = setup(code, inline), before = h.msg.mes, stored = JSON.stringify(h.msg.extra.zhikuComicSrc);
        const result = await h.controller.redrawAll(0);
        assert.equal(result.success, 3); assert.equal(result.completed, 3);
        assert.equal(h.asks, 0); assert.equal(h.saves, 3);
        assert.equal(h.msg.mes, before); assert.equal(JSON.stringify(h.msg.extra.zhikuComicSrc), stored);
        assert(h.requests.every(request => Number.isSafeInteger(request.seed) && request.seed > 0 && request.seed !== 42));
        assert.match(h.requests[0].positive, /cafe/); assert.match(h.requests[1].positive, /street/); assert.match(h.requests[2].positive, /library/);
        for (const [index, block] of h.blocks.entries()) {
            const record = h.msg.extra.zhikuComic[block.key];
            assert.equal(record.versions.length, 2); assert.equal(record.versions[0].url, `old-${index + 1}.png`); assert.equal(record.cur, 1);
            assert.equal(record.versions[1].seed, h.requests[index].seed);
            assert.match(h.requests[index].chars[0].prompt, /Text: 「早上好。/);
        }
        assert.equal(h.controller.status(0).busy, false);
        h.controller.stop();
    }
    {
        const h = setup(code), wait = defer(); h.hold(wait.promise);
        const task = h.controller.redrawAll(0);
        assert.equal(h.controller.redrawAll(0), task, '重复点击共享任务');
        assert.equal(h.controller.status(0).busy, true);
        await h.controller.generateOne(0, h.blocks[1]);
        await h.controller.process(0, { manual: true });
        await h.controller.adapt(0, { redo: true });
        await h.controller.unadapt(0);
        assert.equal(h.requests.length, 1); assert.equal(h.asks, 0);
        wait.resolve(); await task; assert.equal(h.requests.length, 3); h.controller.stop();
    }
    {
        const h = setup(code); h.failAt(2);
        const result = await h.controller.redrawAll(0);
        assert.equal(result.success, 2); assert.equal(result.failed, 1); assert.equal(h.requests.length, 3);
        assert.equal(h.msg.extra.zhikuComic[h.blocks[1].key].versions.length, 1);
        assert.equal(h.msg.extra.zhikuComic[h.blocks[2].key].versions.length, 2);
        assert.match(h.controller.status(0).error, /合成第 2 页失败/);
        h.controller.stop();
    }
    {
        const h = setup(code); h.failSaveAt(2);
        const result = await h.controller.redrawAll(0);
        assert.equal(result.failed, 1); assert.equal(result.success, 2);
        assert.equal(h.msg.extra.zhikuComic[h.blocks[1].key].versions.length, 1);
        assert(h.dropped.includes('new-2.png')); h.controller.stop();
    }
    for (const change of ['chat', 'body', 'swipe', 'stop']) {
        const h = setup(code), wait = defer(); h.hold(wait.promise);
        const before = JSON.stringify(h.msg.extra), task = h.controller.redrawAll(0);
        if (change === 'chat') h.switchChat();
        if (change === 'body') h.msg.mes += ' 用户修改了正文';
        if (change === 'swipe') h.msg.swipe_id = 1;
        if (change === 'stop') h.controller.stop();
        wait.resolve(); await task;
        assert.equal(h.requests.length, 1, change + ' 后停止继续出图');
        assert.equal(JSON.stringify(h.msg.extra), before, change + ' 后在途结果不写入');
        h.controller.stop();
    }
    {
        let prompt = '';
        const h = setup(code), longStory = '合成剧情。'.repeat(2500) + '正文结尾的新剧情。';
        h.msg.mes = longStory; delete h.msg.extra.zhikuComicSrc;
        const doc = { defaultView: {}, head: { appendChild() {} }, createElement: () => ({ remove() {} }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
        const context = { chatId: 'long-story', chat: [h.msg], saveChat: async () => {} };
        const controller = code.createComicController({ document: doc, getContext: () => context, getData: () => ({ options: {} }), esc: String, notify() {},
            askLLM: async (system, user) => { prompt = user; return source; }, generatePage: async () => ({ image: 'synthetic' }), storeImage: async () => ({ url: 'saved.png' }) });
        await controller.adapt(0);
        assert(prompt.includes(longStory), '完整正文进入分镜请求，包括 12000 字后的结尾');
        controller.stop();
        h.controller.stop();
    }
    console.log('PASS ' + label + ' 整楼保留分镜重画、多页出图、新种子、旧版本、去重、失败回滚和聊天候选在途保护');
}

delete globalThis.__zhikuGenerationControl;control.stop();
