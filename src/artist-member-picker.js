// 画师组成员选择：复用本机画师库，只有确认加入时才修改成员。
export function filterArtistLibrary(data, groupId, query='') {
    const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/artist:/g,'').replace(/[_\s]+/g,' ').trim();
    const words=normalize(query).split(' ').filter(Boolean);
    const included=new Set((data.groups?.[groupId]?.members||[]).map(m=>m.artistId));
    return Object.entries(data.artists||{}).filter(([,a])=>a&&a.tag).map(([id,a])=>({id,artist:a,included:included.has(id)}))
        .filter(({artist:a})=>{const text=normalize([a.tag,a.name,a.note].filter(Boolean).join(' '));return words.every(word=>text.includes(word));})
        .sort((a,b)=>Number(a.included)-Number(b.included)||a.artist.tag.localeCompare(b.artist.tag));
}

export function addArtistGroupMembers(data,groupId,ids,manualText,model){
    const group=data.groups?.[groupId];
    if(!group)throw new Error('这个画师组已不存在，请重新打开画师库');
    const candidates=[...new Set(ids)].filter(id=>data.artists?.[id]).map(id=>({artistId:id,weight:1}));
    if(String(manualText||'').trim()){
        for(const item of model.parseArtistList(manualText)){
            const artist=model.ensureArtist(data,item.tag);
            if(artist)candidates.push({artistId:artist.id,weight:item.weight});
        }
    }
    let added=0;const present=new Set(group.members.map(m=>m.artistId));
    for(const member of candidates){if(present.has(member.artistId))continue;group.members.push(member);present.add(member.artistId);added++;}
    return added;
}

export function openArtistMemberPicker({getData,groupId,model,modal,esc,commit,notify}){
    const original=getData().groups?.[groupId];if(!original)return null;
    const box=modal(`<h3 class="pc-h3">从画师库添加</h3>
      <div class="pc-hint">加入「${esc(original.name||'画师组')}」。可多选，新加入的画师权重为 1，加入后可在组里调整。</div>
      <input class="pc-input" style="width:100%;box-sizing:border-box;margin-top:10px" type="search" data-artist-search aria-label="搜索已有画师" placeholder="搜索画师名 / tag / 备注" autocomplete="off">
      <p class="pc-hint" role="status" data-artist-count></p>
      <div data-artist-results style="max-height:42vh;overflow:auto;overscroll-behavior:contain"></div>
      <button type="button" class="pc-pill dashed" data-artist-more hidden>显示更多</button>
      <details class="pc-fold"><summary>手动输入新画师 / 带权重的串</summary>
        <textarea class="pc-textarea" data-artist-manual aria-label="手动输入画师" placeholder="一行一位或逗号隔开，可以带权重"></textarea>
      </details>
      <div class="pc-actions wrap"><button type="button" class="pc-btn dark" data-artist-add disabled>加入所选</button><button type="button" class="pc-btn" data-artist-close>取消</button></div>
      <div class="pc-hint" role="status" data-artist-error></div>`);
    const find=s=>box.querySelector(s),selected=new Set();let limit=100;
    const search=find('[data-artist-search]'),manual=find('[data-artist-manual]'),submit=find('[data-artist-add]');
    function updateButton(){submit.disabled=!selected.size&&!manual.value.trim();submit.textContent='加入所选'+(selected.size?'（'+selected.size+'）':'');}
    function render(){
        const data=getData(),rows=filterArtistLibrary(data,groupId,search.value);
        for(const id of selected)if(!data.artists?.[id]||data.groups?.[groupId]?.members.some(m=>m.artistId===id))selected.delete(id);
        find('[data-artist-count]').textContent=`找到 ${rows.length} 位 · 已选 ${selected.size} 位`;
        find('[data-artist-results]').innerHTML=rows.length?rows.slice(0,limit).map(({id,artist:a,included})=>{
            const banned=model.banInfo?.(data,a.tag);
            return `<label style="display:flex;align-items:center;gap:10px;padding:10px 4px;min-height:44px;box-sizing:border-box;cursor:${included?'default':'pointer'};opacity:${included?'.55':'1'}">
              <input type="checkbox" data-artist-id="${esc(id)}" ${included?'disabled checked':selected.has(id)?'checked':''}>
              <span style="min-width:0;overflow-wrap:anywhere"><b>${esc(a.name||a.tag.replace(/^artist:/,''))}</b><small style="display:block">${esc(a.tag)}${included?' · 已在组内':''}${banned?' · 已拉黑':''}</small>${a.note?'<small style="display:block">'+esc(String(a.note).slice(0,120))+'</small>':''}</span>
            </label>`;
        }).join(''):'<div class="pc-hint">'+(Object.keys(data.artists||{}).length?'没有匹配的画师，换个关键词，或展开下方手动输入。':'画师库还是空的，可以展开下方手动输入。')+'</div>';
        find('[data-artist-more]').hidden=rows.length<=limit;updateButton();
    }
    search.addEventListener('input',()=>{limit=100;render();});
    manual.addEventListener('input',updateButton);
    box.addEventListener('change',event=>{const input=event.target.closest('[data-artist-id]');if(!input||input.disabled)return;const id=input.dataset.artistId;if(input.checked)selected.add(id);else selected.delete(id);find('[data-artist-count]').textContent=`找到 ${filterArtistLibrary(getData(),groupId,search.value).length} 位 · 已选 ${selected.size} 位`;updateButton();});
    find('[data-artist-more]').onclick=()=>{limit+=100;render();};
    find('[data-artist-close]').onclick=()=>box.closeModal();
    submit.onclick=()=>{
        if(submit.disabled)return;
        if(getData().groups?.[groupId]!==original){find('[data-artist-error]').textContent='画师组已变化，请关闭后重新添加';submit.disabled=true;return;}
        try{
            const added=addArtistGroupMembers(getData(),groupId,selected,manual.value,model);
            if(!added){find('[data-artist-error]').textContent='没有新增画师：可能已在组内，或输入没有可识别的画师';return;}
            submit.disabled=true;box.closeModal();commit();notify?.(`已加入 ${added} 位画师`);
        }catch(error){find('[data-artist-error]').textContent=error.message||String(error);}
    };
    render();return box;
}
// 画师组成员选择结束。
