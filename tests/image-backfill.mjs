// 合成聊天验证批量补图、旧标记重试、隐藏楼层、候选回复隔离和中途停止。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createImageBackfill } from '../src/image-backfill.js';
import { createIllustrationPlanner } from '../src/illustration-runtime.js';
import { createMarkerController } from '../src/marker-generation.js';
import { isComicReply, createComicController, comicBlocks } from '../src/comic.js';
import { imageStoryText } from '../src/image-characters.js';
import * as imageCharacters from '../src/image-characters.js';
import * as illustrationPlans from '../src/illustration-plans.js';
import * as markerGeneration from '../src/marker-generation.js';
import * as selectedImages from '../src/selected-image.js';

const runtime = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const generated = vm.runInNewContext(runtime.slice(runtime.indexOf('// 只调度当前聊天'), runtime.indexOf('const COMIC_BLOCK')) + '\ncreateImageBackfill', { isComicReply, imageStoryText });
const generatedMarker = vm.runInNewContext(runtime.slice(runtime.indexOf('// Marker-triggered generation'), runtime.indexOf('const pcLocal =')) + '\ncreateMarkerController', { isComicReply });
const generatedPlanner = vm.runInNewContext(runtime.slice(runtime.indexOf('function createIllustrationPlanner'), runtime.indexOf('function renderIllustrationEditor')) + '\ncreateIllustrationPlanner', { ...imageCharacters, ...illustrationPlans, ...markerGeneration, ...selectedImages, isComicReply });
const page = '<image>@page\ncomic page, 1 panel\n@panel P1\ncafe interior\n@character C1\nboy, black hair, holding a book\nText: 早上好。</image>';
const emptyComic = { status: () => ({ images: 0, busy: false }), adapt: async () => {} };
function setup(factory, messages) {
    let context = { chatId: 'fixture', chat: messages, extensionSettings: {}, saveChat: async () => {}, updateMessageBlock() {} };
    const calls = [], warnings = [], options = { illustMode: 'off', markerAuto: false, illustMax: 1 };
    let barrier = null, failing = false, saveFail = false;
    const makeMarker = factory === generated ? generatedMarker : createMarkerController;
    const makePlanner = factory === generated ? generatedPlanner : createIllustrationPlanner;
    const marker = makeMarker({
        document: null, context: () => context, getData: () => ({ options }),
        generate: async prompt => { calls.push(['image', prompt]); if (barrier) await barrier; if (failing) throw Error('合成生图失败'); return 'synthetic-image'; },
        upload: async () => ({ url: 'synthetic-' + calls.length + '.png' }), notify: message => warnings.push(message),
    });
    context.saveChat = async () => { if (saveFail) throw Error('合成保存失败'); };
    const planner = makePlanner({
        getContext: () => context, getData: () => ({ options }), settings: marker.settings, roster: () => [], pickJson: JSON.parse,
        askLLM: async (system, user) => {
            calls.push(['ai', JSON.parse(user)]); if (barrier) await barrier;
            return JSON.stringify({ images: [{ after: '角色走进咖啡馆。', tags: 'cafe, book, warm lighting' }] });
        },
        warn: message => warnings.push(message), afterSave: (id, result) => marker.process(id, { manual: true, tokenIndices: result.tokenIndices }),
    });
    const controller = factory({ getContext: () => context, planner, marker, comic: emptyComic });
    return { controller, planner, marker, calls, warnings, get context() { return context; },
        switchChat() { context = { ...context, chatId: 'other', chat: [{ mes: '另一个聊天' }] }; },
        hold(value) { barrier = value; }, fail(value) { failing = value; }, failSave(value) { saveFail = value; },
    };
}
const reply = extra => ({ name: '合成角色', mes: '角色走进咖啡馆。手里拿着一本书。', swipe_id: 0, ...extra });
for (const [label, factory] of [['源码', createImageBackfill], ['发布代码', generated]]) {
    // 本楼按钮：关闭自动插图时仍可选镜补图，已有成功图不重画，只补剩余标记。
    const single=setup(factory,[reply(),reply()]);
    let singleReport=await single.controller.fillFloor(0);
    assert.equal(singleReport.rows.length,1);assert.equal(singleReport.rows[0].status,'done');
    assert.equal(single.calls.filter(c=>c[0]==='ai').length,1);
    assert(!single.context.chat[1].extra,'只处理点击楼层');
    const spent=single.calls.length;await single.controller.fillFloor(0);assert.equal(single.calls.length,spent,'已有完整普通图不重画');
    const partial=setup(factory,[reply({mes:'角色走进咖啡馆。image###first### image###second###'})]);
    await partial.marker.process(0,{manual:true,tokenIndices:[0]});
    assert.equal(partial.marker.status(0).images,1);
    partial.fail(true);singleReport=await partial.controller.fillFloor(0);
    assert.equal(singleReport.rows[0].status,'failed','已有一张图不掩盖另一张失败');
    assert.match(singleReport.rows[0].reason,/仍有 1 张/);
    partial.fail(false);singleReport=await partial.controller.fillFloor(0);
    assert.equal(singleReport.rows[0].status,'done');assert.equal(partial.marker.status(0).images,2);
    assert.equal(partial.calls.filter(c=>c[0]==='ai').length,0,'已有提示词不重新调用文字 AI');
    assert.equal(partial.calls.filter(c=>c[0]==='image'&&c[1]==='first').length,1,'保留成功图片');
    const queued=setup(factory,[reply(),reply()]);let finish;
    queued.hold(new Promise(resolve=>{finish=resolve;}));
    const same=queued.controller.fillFloor(0);assert.equal(queued.controller.fillFloor(0),same);
    assert.throws(()=>queued.controller.fillFloor(1),/已有补图任务/);
    finish();await same;
    const old = reply({ mes: '角色走进咖啡馆。image###warm cafe###' });
    const done = reply({ mes: '角色走进咖啡馆。image###saved###' });
    done.extra = { zhikuImages: { ['0:9:image###saved###']: { url: 'existing.png' } } };
    const fixture = setup(factory, [{ is_user: true, mes: '你好' }, reply({ is_system: true }), old, done, { is_system: true, name: 'System', mes: '系统文字' }, reply()]);
    assert.equal(fixture.controller.preview(0, 5).candidates, 3);
    assert.throws(() => fixture.controller.start({ from: -1, to: 5 }), /有效/);
    assert.throws(() => fixture.controller.start({ from: 0, to: 6 }), /有效/);
    let report = await fixture.controller.start({ from: 0, to: 5 });
    assert.equal(report.rows.filter(row => row.status === 'done').length, 3);
    assert.equal(report.rows.filter(row => row.status === 'skipped').length, 1);
    assert.equal(fixture.calls.filter(call => call[0] === 'ai').length, 2, '已有标记直接出图');
    assert.equal(fixture.calls.filter(call => call[0] === 'image').length, 3);
    assert.equal(fixture.context.chat[1].is_system, true);
    assert.equal(fixture.context.chat[1].swipe_id, 0);
    assert(!JSON.stringify(fixture.calls).includes('existing.png'));
    await fixture.controller.start({ from: 0, to: 5 });
    assert.equal(fixture.calls.length, 5, '重复补图跳过已有图');

    // 新候选回复可以补，其他候选的图继续按原来的 key 保存。
    old.swipe_id = 1;
    report = await fixture.controller.start({ from: 2, to: 2 });
    assert.equal(report.rows[0].status, 'done');
    assert.equal(Object.keys(old.extra.zhikuImages).length, 2);

    const retry = setup(factory, [reply(), reply()]);
    retry.fail(true);
    report = await retry.controller.start({ from: 0, to: 1 });
    assert.equal(report.rows.filter(row => row.status === 'failed').length, 2, '逐楼失败继续');
    assert(report.rows.every(row => row.reason.includes('合成生图失败')));
    retry.fail(false);
    report = await retry.controller.start({ from: 0, to: 1 });
    assert(report.rows.every(row => row.status === 'done'));
    assert.equal(retry.calls.filter(call => call[0] === 'ai').length, 2, '失败后复用已存方案');

    const rollback = setup(factory, [reply()]);
    const before = JSON.stringify(rollback.context.chat);
    rollback.failSave(true);
    report = await rollback.controller.start({ from: 0, to: 0 });
    assert.equal(report.rows[0].status, 'failed');
    assert.equal(JSON.stringify(rollback.context.chat), before);
    assert.equal(rollback.calls.filter(call => call[0] === 'image').length, 0);

    const inline = setup(factory, [reply({ mes: '<content>角色走进咖啡馆。<img src="already.png"></content>' }), reply({ mes: '角色走进咖啡馆。![插图](already.png)' }), reply({ mes: '<content>角色走进咖啡馆。</content><details><img src="status.png"></details>' })]);
    assert.equal(inline.controller.preview(0, 2).candidates, 1, '正文已有图片跳过，状态栏图片单独处理');
    report = await inline.controller.start({ from: 0, to: 2 });
    assert.equal(report.rows.filter(row => row.status === 'done').length, 1);

    // 同时点击开始共享同一轮任务，停止后仅收尾当前楼。
    const stopped = setup(factory, [reply(), reply()]);
    let release;
    stopped.hold(new Promise(resolve => { release = resolve; }));
    const job = stopped.controller.start({ from: 0, to: 1 });
    assert.equal(stopped.controller.start({ from: 0, to: 1 }), job);
    stopped.controller.cancel(); release();
    report = await job;
    assert.equal(report.rows[0].status, 'done');
    assert.equal(report.rows[1].reason, '尚未执行');
    assert.equal(stopped.calls.filter(call => call[0] === 'ai').length, 1);

    const switched = setup(factory, [reply(), reply()]);
    switched.hold(new Promise(resolve => { release = resolve; }));
    const switching = switched.controller.start({ from: 0, to: 1 });
    switched.switchChat(); switched.controller.chatChanged(); release();
    report = await switching;
    assert.equal(report.reason, '聊天已切换，补图已停止');
    assert.equal(switched.context.chat[0].mes, '另一个聊天');
    assert.equal(switched.calls.filter(call => call[0] === 'image').length, 0);

    const edited = setup(factory, [reply(), reply()]);
    edited.hold(new Promise(resolve => { release = resolve; }));
    const editing = edited.controller.start({ from: 0, to: 1 });
    edited.context.chat[1].mes = '用户编辑了正文'; release();
    report = await editing;
    assert.equal(report.rows[1].reason, '正文或候选回复已变化');

    const busy = setup(factory, [reply()]);
    busy.hold(new Promise(resolve => { release = resolve; }));
    const planning = busy.planner.backfill(0);
    assert.equal(busy.controller.preview(0, 0).busy, 1);
    report = await busy.controller.start({ from: 0, to: 0 });
    assert.equal(report.rows[0].reason, '正在生成'); release(); await planning;

    // 漫画也走既有控制器，缺分镜才调用 AI，重试复用分镜。
    const chat = [reply({ is_system: true }), reply({ mes: page })];
    let asks = 0, draws = 0;
    const context = { chatId: 'comic-fixture', chat, saveChat: async () => {} };
    const doc = { defaultView: { setTimeout, clearTimeout }, head: { appendChild() {} }, createElement: () => ({ remove() {} }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
    const comic = createComicController({ document: doc, getContext: () => context, getData: () => ({ options: {} }),
        askLLM: async () => { asks++; return page; }, generatePage: async () => { draws++; return { image: 'synthetic' }; }, storeImage: async () => ({ url: 'comic.png' }), notify() {}, esc: String });
    const batch = factory({ getContext: () => context, planner: { status: () => ({}) }, marker: { status: () => ({ images: 0 }) }, comic });
    report = await batch.start({ from: 0, to: 1, mode: 'comic' });
    assert(report.rows.every(row => row.status === 'done'));
    assert.equal(asks, 1); assert.equal(draws, 2);
    await batch.start({ from: 0, to: 1, mode: 'comic' });
    assert.equal(draws, 2);
    assert.equal(comic.status(0).images, 1);
    assert.equal(comicBlocks(chat[1].mes).length, 1);
    comic.stop();

    // 同一楼的漫画与普通插图分别补缺，预览和实际调度使用相同类型。
    const typedChat = [reply(), reply(), reply(), reply({ mes: '角色走进咖啡馆。![正文图](existing.png)' })];
    const illustrations = [0, 1, 1, 0], comics = [1, 0, 1, 0], typedCalls = [];
    let comicBusy = false;
    const typed = factory({
        getContext: () => ({ chatId: 'typed-fixture', chat: typedChat }),
        planner: { status: () => ({}), backfill: async id => { typedCalls.push(['ill', id]); illustrations[id]++; } },
        marker: { status: id => ({ images: illustrations[id], busy: false, tokens: 0 }) },
        comic: { status: id => ({ images: comics[id], busy: comicBusy }), adapt: async id => { typedCalls.push(['comic', id]); comics[id]++; } },
    });
    assert.equal(typed.preview(0, 3, 'ill').candidates, 1, '仅有漫画可补普通插图');
    assert.equal(typed.preview(0, 3, 'comic').candidates, 2, '仅有普通插图及内嵌图可补漫画');
    comicBusy = true;
    assert.equal(typed.preview(0, 0, 'ill').busy, 1, '另一类型在途仍保护楼层');
    report = await typed.start({ from: 0, to: 0, mode: 'ill' });
    assert.equal(report.rows[0].reason, '正在生成');
    comicBusy = false;
    report = await typed.start({ from: 0, to: 3, mode: 'ill' });
    assert.equal(report.rows[0].status, 'done');
    assert(report.rows.slice(1).every(row => row.reason === '已有普通插图'));
    report = await typed.start({ from: 0, to: 3, mode: 'comic' });
    assert.equal(report.rows[0].reason, '已有漫画');
    assert.equal(report.rows[1].status, 'done');
    assert.equal(report.rows[2].reason, '已有漫画');
    assert.equal(report.rows[3].status, 'done');
    assert.deepEqual(typedCalls, [['ill', 0], ['comic', 1], ['comic', 3]]);
    assert.equal(typed.preview(0, 3, 'ill').candidates, 0);
    assert.equal(typed.preview(0, 3, 'comic').candidates, 0);
    console.log('PASS ' + label + ' 补图范围、隐藏楼、旧标记、重试、候选、停止、切聊天、忙碌保护与漫画正式控制器');
}
for (const text of ["globalThis.__zhikuBackfill = backfillGateway", 'fillFloor:backfill.fillFloor', 'backfill.chatChanged(); selectedImages.reset()', "fn: 'ill'", "fn: 'comic'", 'data-act="image-backfill"']) assert(runtime.includes(text), text);
console.log('PASS 发布构建接入副 API、普通插图入口、漫画入口和聊天切换清理');
