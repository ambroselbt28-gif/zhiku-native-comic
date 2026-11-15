import fs from 'node:fs';
import assert from 'node:assert/strict';

export function applyAutoCharacterProfiles(source) {
    let s=source;
    const patch=(from,to)=>{assert.equal(s.split(from).length,2,'自动建档锚点 '+from.slice(0,70));s=s.replace(from,()=>to);};
    patch('getChar, saveChar, descOf,','getChar, blank, saveChar, descOf,');
    patch('    const illustrationPlanner = createIllustrationPlanner({',`    const profiles = createAutoCharacterProfiles({
        getContext:()=>SillyTavern.getContext(),getData,characters:C,settings:()=>__mod_marker.settings(),uid:__mod_model.uid,
        askLLM:(system,user,options)=>__mod_translate.askLLM(system,user,{...options,fn:'look'}),pickJson:__mod_translate.pickJson,
        commit:options=>__mod_store.commit(options),notify:message=>toastr.info(message,'智库 · 人物档案',{timeOut:6000}),refresh:()=>UI.refreshProfiles(),
    });
    const profileEditor = createProfileEditor({profiles,characters:C,modal:UI.modal,esc:UI.esc,preview:key=>UI.previewProfile(key)});
    const profileGateway = {...profiles,open:profileEditor.open};
    globalThis.__zhikuProfiles=profileGateway;
    cleanups.push(()=>{profiles.stop();profileEditor.stop();if(globalThis.__zhikuProfiles===profileGateway)globalThis.__zhikuProfiles=null;});
    const illustrationPlanner = createIllustrationPlanner({
        prepare:id=>profiles.scan(id,{manual:true}),`);
    patch('    const comic = createComicController({','    const comic = createComicController({\n        prepare:id=>profiles.scan(id,{manual:true}),');
    patch('context:()=>SillyTavern.getContext(),getData:__mod_store.getData,document:DOC,','context:()=>SillyTavern.getContext(),getData:__mod_store.getData,document:DOC,prepare:id=>globalThis.__zhikuProfiles?.scan(id,{manual:true}),');
    patch('const onChat = () => { backfill.chatChanged();','const onChat = () => { profiles.chatChanged(); backfill.chatChanged();');
    const start=s.indexOf('    const onCharMsg = id => {'),end=s.indexOf('    for (const [ev, fn] of [[event_types.USER_MESSAGE_RENDERED',start);
    assert(start>=0&&end>start,'角色回复入口');
    patch(s.slice(start,end),`    const onCharMsg = id => {
        setTimeout(async()=>{
            const c=SillyTavern.getContext(),msg=c.chat?.[Number(id)],chat=C.chatId(),body=msg?.mes,swipe=msg?.swipe_id;
            await profiles.scan(Number(id));
            if(stopped||C.chatId()!==chat||SillyTavern.getContext().chat?.[Number(id)]!==msg||msg?.mes!==body||msg?.swipe_id!==swipe)return;
            comic.render(Number(id));void comic.process(Number(id)).catch(error=>console.warn('[智库] 漫画',error));
            const o=getData().options,n=o.illustMode==='inline'?Math.max(1,Number(o.illustMax)||1):0;
            void __mod_marker.process(Number(id),n?{tokenIndices:[...Array(n).keys()]}:{}).catch(error=>console.warn('[智库] 标记生图',error));
            void illustAfter(Number(id)).catch(error=>console.warn('[智库] 自动插图',error));
        },0);
        setTimeout(addMesButtons,50);
    };
`);
    patch('<b>固定外貌</b><span class="pc-chips" style="margin:0">',`<b>固定外貌</b><span class="pc-chips" style="margin:0"><button class="pc-pill dashed tiny" data-act="profile-open" \${busy ? 'disabled' : ''}>外貌方案 · 存取 / AI</button>`);
    patch('      <div class="pc-dim small">头发、眼睛、脸、身材这类不会变的。',`      \${renderAppearancePresets(c,{esc,busy:!!busy||!!globalThis.__zhikuProfiles?.isBusy(c.key)})}
      <div class="pc-dim small">头发、眼睛、脸、身材这类不会变的。`);
    patch("        case 'casttab':",`        case 'profile-open': globalThis.__zhikuProfiles?.open(ui.charKey); return true;
        case 'profile-preset': {
            try { await globalThis.__zhikuProfiles?.applyPreset(el.dataset.key,el.dataset.id); }
            catch(error) { toastr.error(error.message || String(error),'智库 · 外貌方案'); }
            return true;
        }
        case 'profile-save-current': {
            const key=el.dataset.key;
            const name=await promptText('保存当前外貌方案，叫什么？','');
            if(!name)return true;
            try { await globalThis.__zhikuProfiles?.savePreset(key,name); }
            catch(error) { toastr.error(error.message || String(error),'智库 · 外貌方案'); }
            return true;
        }
        case 'profile-scan': await globalThis.__zhikuProfiles?.scan((SillyTavern.getContext().chat?.length||0)-1,{manual:true,force:true}); render(); return true;
        case 'casttab':`);
    patch('<h2 class="pc-h2" style="margin:0">这次聊天</h2>',`<h2 class="pc-h2" style="margin:0">这次聊天</h2>
      <div class="pc-row-between pc-mt-s"><span>首次出场自动建档</span>\${sw2(d.options.autoCharacterProfiles !== false,'data-opt="autoCharacterProfiles"')}</div>
      <div class="pc-hint">新正文用「读角色外貌」副 API 识别并建立档案，已有外貌继续沿用。缺少外貌时由 AI 补全，可在人物页重roll或用自然语言修改。每条新正文多一次文字请求。</div>
      <button class="pc-pill dashed tiny" data-act="profile-scan">扫描当前回复的人物</button>`);
    patch('return { modal, esc, openWindow,','async function previewProfile(key) { await charAction(\'openchar\',{dataset:{key}}); return charAction(\'chartest\',{dataset:{}}); }\nreturn { previewProfile, refreshProfiles:()=>{if(root)render();}, modal, esc, openWindow,');
    const helpers=fs.readFileSync(new URL('../src/auto-character-profiles.js',import.meta.url),'utf8').replace(/\r\n/g,'\n').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
    return helpers+'\n'+s;
}
