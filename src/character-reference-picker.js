// 角色参考分组：只改变选择列表的展示，不修改任何绑定或参考图片。
export function partitionCharacterReferences(data, character, currentCast = []) {
    const owner = c => c?.kind === 'char' ? c.avatar : c?.kind === 'side' ? c.card : '';
    const here = currentCast.map(row => row.char).filter(Boolean);
    const card = owner(character);
    const inChat = here.some(c => c.key === character?.key || (card && owner(c) === card));
    const related = inChat ? [...here, character] : [character];
    const keys = new Set(related.map(c => c?.key).filter(Boolean));
    const cards = new Set(related.map(owner).filter(Boolean));
    const refs = new Set(related.map(c => c?.charRef).filter(Boolean));
    for (const c of Object.values(data.characters || {})) {
        if (c && (keys.has(c.key) || (owner(c) && cards.has(owner(c)))) && c.charRef) refs.add(c.charRef);
    }
    // 当前选中的跨卡参考也始终显示，避免折叠后让人误以为绑定丢失。
    if (character?.charRef) refs.add(character.charRef);
    const local = [], other = [];
    for (const group of Object.values(data.charRefGroups || {})) {
        if (group?.id) (refs.has(group.id) ? local : other).push(group);
    }
    return { local, other };
}

export function renderCharacterReferencePicker(data, character, currentCast, esc) {
    const { local, other } = partitionCharacterReferences(data, character, currentCast);
    const selected = data.charRefGroups?.[character?.charRef]?.id;
    const button = group => `<button type="button" class="pc-pill ${selected === group.id ? 'on' : 'dashed'}" data-act="charrefpick" data-id="${esc(group.id)}" data-lp="crgroup">${esc(group.name || '未命名参考')}</button>`;
    return `<div data-character-reference-picker>
      <div class="pc-chips wrap" data-local-charrefs><button type="button" class="pc-pill ${!selected ? 'on' : 'dashed'}" data-act="charrefpick" data-id="">不用</button>${local.map(button).join('')}
        <label class="pc-pill dashed">＋ 新的一组<input type="file" accept="image/*" data-charrefup hidden></label></div>
      ${other.length ? `<details class="pc-fold pc-mt-s" data-other-charrefs><summary><b>其他角色／未绑定的参考</b><i>${other.length} 组 · 点击展开</i></summary><div class="pc-fold-in"><div class="pc-chips wrap">${other.map(button).join('')}</div></div></details>` : ''}
    </div>`;
}
// 角色参考分组结束。
