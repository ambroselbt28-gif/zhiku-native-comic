import fs from 'node:fs';
import assert from 'node:assert/strict';

export function applyCharacterReferencePicker(source) {
    const from = '        return `<div class="pc-chips wrap"><button class="pc-pill ${!g ?';
    const to = '        ${g ? `<div class="pc-row-between pc-mt-s">';
    const start = source.indexOf(from), end = source.indexOf(to, start);
    assert.equal(source.split(from).length, 2, '人物长相参考选择入口');
    assert(start >= 0 && end > start);
    source = source.slice(0, start) + '        return `${renderCharacterReferencePicker(d, c, C.currentCast(), esc)}\n' + source.slice(end);
    const anchor = 'function viewCharEdit(d) {';
    assert.equal(source.split(anchor).length, 2, '人物详情渲染入口');
    const helper = fs.readFileSync(new URL('../src/character-reference-picker.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/^export /gm, '');
    return source.replace(anchor, () => helper + '\n' + anchor);
}
