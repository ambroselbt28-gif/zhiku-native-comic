import fs from 'node:fs';
import assert from 'node:assert/strict';

export function applyImageBackfill(source) {
    let s = source;
    const patch = (from, to) => {
        assert.equal(s.split(from).length, 2, '补图构建锚点 ' + from.slice(0, 80));
        s = s.replace(from, () => to);
    };
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
    globalThis.__zhikuBackfill = backfillUI;
    cleanups.push(() => { backfill.stop(); backfillUI.stop(); if (globalThis.__zhikuBackfill === backfillUI) globalThis.__zhikuBackfill = null; });`);
    patch('const onChat = () => { selectedImages.reset();', 'const onChat = () => { backfill.chatChanged(); selectedImages.reset();');
    const helpers = fs.readFileSync(new URL('../src/image-backfill.js', import.meta.url), 'utf8')
        .replace(/\r\n/g, '\n').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
    return helpers + '\n' + s;
}
