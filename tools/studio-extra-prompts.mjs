import fs from 'node:fs';
import assert from 'node:assert/strict';
export function applyStudioExtraPrompts(source){
    const patch=(from,to)=>{assert.equal(source.split(from).length,2,'生图补充词：'+from.slice(0,65));source=source.replace(from,()=>to);};
    patch("    st.scene = saved.scene || '';","    st.extraPositive = String(saved.extraPositive || '');\n    st.extraNegative = String(saved.extraNegative || '');\n    st.scene = saved.scene || '';");
    patch('d.studio = { sourceRef: st.sourceRef || null,',"d.studio = { extraPositive: st.extraPositive || '', extraNegative: st.extraNegative || '', sourceRef: st.sourceRef || null,");
    patch('function studioParts() { return { pos: ui.studio.pos, neg: ui.studio.neg, scene: sceneTags() }; }',`function studioParts() {
    const st=ui.studio,join=parts=>parts.map(part=>String(part||'').trim()).filter(Boolean).join(', ');
    return {pos:st.pos,neg:join([st.neg,st.extraNegative]),scene:join([sceneTags(),st.extraPositive])};
}`);
    patch('      <div class="pc-mini pc-mt-s">${sceneFold()}${castFold()}${i2iFold(s)}</div>','      ${renderStudioExtraPrompts(st,esc)}\n      <div class="pc-mini pc-mt-s">${sceneFold()}${castFold()}${i2iFold(s)}</div>');
    patch("['studio.pos', 'studio.neg', 'studio.scene', 'studio.sceneEn'].includes(el.dataset.bind)","['studio.pos', 'studio.neg', 'studio.scene', 'studio.sceneEn', 'studio.extraPositive', 'studio.extraNegative'].includes(el.dataset.bind)");
    patch("            case 'generate': await doGenerate(); break;",`            case 'studioextraclear': { ui.studio.extraPositive='';ui.studio.extraNegative='';saveStudio();render();break; }
            case 'generate': await doGenerate(); break;`);
    patch("if (!st.pos.trim() && !studioCast().length)","if (!st.pos.trim() && !String(st.extraPositive || '').trim() && !String(sceneTags() || '').trim() && !studioCast().length)");
    patch("if (T.hasChinese(st.pos.replace(/（[^（）]*）/g, ''))) {","if (T.hasChinese([st.pos,st.extraPositive,st.extraNegative].filter(Boolean).join(', ').replace(/（[^（）]*）/g, ''))) {");
    patch('正面提示词里有中文，NovelAI 看不懂中文。还是要生成吗？（中文描述可以写进下面的「固定提示词」，会自动转成标签）','提示词或本次补充里有中文，建议先转换为英文。仍要原样生成吗？（中文画面描述可写进「固定提示词」自动转换）');
    patch('function viewStudio(d) {',fs.readFileSync(new URL('../src/studio-extra-prompts.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\nfunction viewStudio(d) {');
    return source;
}
