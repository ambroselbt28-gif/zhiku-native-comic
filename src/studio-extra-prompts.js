// 生图页补充词只参与本页出图，不写入画师串或聊天生图设置。
export function renderStudioExtraPrompts(st,esc){
    return `<section class="pc-studio-extra pc-mt-s" style="border-top:1px dashed var(--pc-dash,#aaa);padding-top:12px">
      <div class="pc-row-between"><b>这张图要画什么</b><button type="button" class="pc-pill dashed tiny" data-act="studioextraclear">清空补充</button></div>
      <label class="pc-field"><span>本次正面补充</span><textarea class="pc-textarea small" style="width:100%;box-sizing:border-box" data-bind="studio.extraPositive" placeholder="例如：1girl, long black hair, standing by a window, soft lighting">${esc(st.extraPositive||'')}</textarea></label>
      <label class="pc-field"><span>本次负面补充</span><textarea class="pc-textarea small" style="width:100%;box-sizing:border-box" data-bind="studio.extraNegative" placeholder="例如：photorealistic, 3d, text, watermark">${esc(st.extraNegative||'')}</textarea></label>
      <div class="pc-hint">填写英文 tag 或英文句子，会与上方画师串的正面、负面一起发送。只用于生图页，不保存进画师串；内容会保留到你修改或清空。中文画面描述可用下方「固定提示词」自动转换。</div>
    </section>`;
}
// 生图页补充词界面结束。
