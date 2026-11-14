import fs from 'node:fs';
import assert from 'node:assert/strict';

export function applyUpdateReload(source) {
    function patch(from, to) {
        assert.equal(source.split(from).length, 2, '自动重载补丁锚点：' + from.slice(0, 80));
        source = source.replace(from, () => to);
    }
    // 构造器只增加操作计数，不改变同步返回值或原 Promise。
    let helpers = fs.readFileSync('src/update-reload.js', 'utf8').split('export function createReloadActivity')[1];
    helpers = 'function createReloadActivity' + helpers;
    source = helpers + '\nconst __zhikuActivity = createReloadActivity();\n' + source;
    patch('return {\n    start: () => __mod_script_entry.start(),', `
const __zhikuWrapFactory = make => (...args) => __zhikuActivity.wrap(make(...args));
createAutoCharacterProfiles = __zhikuWrapFactory(createAutoCharacterProfiles);
createIllustrationPlanner = __zhikuWrapFactory(createIllustrationPlanner);
createComicController = __zhikuWrapFactory(createComicController);
createImageBackfill = __zhikuWrapFactory(createImageBackfill);
for (const mod of [__mod_nai, __mod_engine, __mod_translate, __mod_marker, __mod_store, __mod_chars, __mod_lobby]) __zhikuActivity.wrap(mod);
return {
    canReload: () => __zhikuActivity.idle() && !DOC.querySelector('#pc-root.open, .pc-sheet-backdrop, .pc-modal-backdrop, .pc-viewer, .pc-image-preview, .pc-comic-book'),
    start: () => __mod_script_entry.start(),`);
    // 停止时先拆入口与延迟回调，再等待存储，避免保存期间又进入旧实例。
    patch('        __mod_store.detach();\n        await __mod_store.flush();', '        ownCleanup?.();\n        __mod_store.detach();\n        await __mod_store.flush();');
    patch('        try { await __mod_script_entry.stop(); }', '        stopped = true;\n        for (const id of timers) window.clearTimeout(id);\n        timers.clear();\n        try { await __mod_script_entry.stop(); }');
    patch('<button type="button" class="menu_button" data-zhiku="switch">切换画师串</button>', '<button type="button" class="menu_button" data-zhiku="switch">切换画师串</button><button type="button" class="menu_button" data-zhiku="reload">重载智库</button>');
    patch("        const autoToggle=panel.querySelector('[data-zhiku=\"auto\"]');", "        panel.querySelector('[data-zhiku=\"reload\"]').addEventListener('click', () => globalThis.__zhikuRequestReload?.());\n        const autoToggle=panel.querySelector('[data-zhiku=\"auto\"]');");
    return source;
}

export function buildReloadEntry() {
    const helper = fs.readFileSync('src/update-reload.js', 'utf8').split('// 跟踪完整操作 Promise')[0].replace('export function', 'function');
    return helper + '\n' + fs.readFileSync('src/index.js', 'utf8').replace("import { createUpdateReloader } from './update-reload.js';", '');
}
