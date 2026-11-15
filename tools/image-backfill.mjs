import fs from 'node:fs';
import assert from 'node:assert/strict';

export function applyImageBackfill(source) {
    let s = source;
    const patch = (from, to) => {
        assert.equal(s.split(from).length, 2, '补图构建锚点 ' + from.slice(0, 80));
        s = s.replace(from, () => to);
    };
    patch("b.title = '智库：请在对应提示词旁点击生成';", "b.title = '智库：补本楼普通生图';\n        b.setAttribute('aria-label', '补本楼普通生图');");
    patch('async function genFor(mesId) { await __mod_marker.process(mesId, { manual: true }); }', `async function genFor(mesId) {
    if(genning.has(mesId))return;
    const controller=globalThis.__zhikuBackfill;
    if(!controller?.fillFloor){toastr.warning('普通补图模块尚未就绪，请稍后再试','智库 · 补本楼普通生图');return;}
    genning.add(mesId);
    const buttons=DOC.querySelectorAll('.mes[mesid="'+mesId+'"] .pc-mes-gen');
    for(const button of buttons){button.title='正在补本楼普通生图…';button.setAttribute('aria-busy','true');}
    try{
        toastr.info('正在补第 '+mesId+' 楼普通插图；缺少提示词时会先调用正文插图 AI','智库 · 补本楼普通生图');
        const result=await controller.fillFloor(mesId),row=result.rows.find(item=>item.id===mesId);
        const message=row?.reason||result.reason||'本楼补图已结束';
        toastr[row?.status==='failed'?'error':row?.status==='done'?'success':'info'](message,'智库 · 补本楼普通生图');
    }catch(error){toastr.error(error?.message||String(error),'智库 · 补本楼普通生图');}
    finally{genning.delete(mesId);for(const button of buttons){button.title='智库：补本楼普通生图';button.removeAttribute('aria-busy');}}
}`);
    patch("            case 'comicbook':", "            case 'image-backfill': globalThis.__zhikuBackfill?.open(ui.view === 'comic' ? 'comic' : 'ill'); break;\n            case 'comicbook':");
    const bookButton = '<button class="pc-btn" data-act="comicbook">翻看这个聊天的漫画</button>';
    const darkBookButton = '<button class="pc-btn dark" data-act="comicbook">翻看这个聊天的漫画</button>';
    const backfillButton = '<button class="pc-btn" data-act="image-backfill">补未生图楼层</button>';
    patch(bookButton, bookButton + backfillButton);
    patch(darkBookButton, darkBookButton + backfillButton);
    patch('<div class="pc-actions wrap"><button class="pc-btn dark" data-act="illprompt-save">', '<div class="pc-actions wrap">' + backfillButton + '<button class="pc-btn dark" data-act="illprompt-save">');
    patch('    globalThis.__zhikuComic = comic;', `    globalThis.__zhikuComic = comic;
    const backfill = createImageBackfill({
        getContext: () => SillyTavern.getContext(), planner: illustrationPlanner, marker: __mod_marker, comic,
        validate: mode => {
            if (mode === 'comic' && N.settings().naiMode === 'tavern') throw new Error('漫画需要先配置自己的 NovelAI 或兼容第三方站点接口');
            if (mode === 'ill') {
                const cfg = __mod_marker.settings();
                if (!cfg.start || !cfg.end) throw new Error('请先在设置里填写生图标记的起止分隔符');
            }
        },
    });
    const backfillUI = createImageBackfillUI({
        controller: backfill, getContext: () => SillyTavern.getContext(), modal: UI.modal, esc: UI.esc,
        apiLabel: mode => { const api = __mod_translate.apiFor(mode === 'comic' ? 'comic' : 'ill'); return [api.from, api.model].filter(Boolean).join(' · ') || '跟随当前 AI 配置'; },
    });
    const backfillGateway = {...backfillUI,fillFloor:backfill.fillFloor};
    globalThis.__zhikuBackfill = backfillGateway;
    cleanups.push(() => { backfill.stop(); backfillUI.stop(); if (globalThis.__zhikuBackfill === backfillGateway) globalThis.__zhikuBackfill = null; });`);
    patch('const onChat = () => { selectedImages.reset();', 'const onChat = () => { backfill.chatChanged(); selectedImages.reset();');
    const helpers = fs.readFileSync(new URL('../src/image-backfill.js', import.meta.url), 'utf8')
        .replace(/\r\n/g, '\n').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
    return helpers + '\n' + s;
}
