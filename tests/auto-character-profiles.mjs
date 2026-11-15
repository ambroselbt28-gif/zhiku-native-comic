// 合成聊天验证首次建档、方案重roll、自然语言修改及正式角色标签调用。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as original from '../src/auto-character-profiles.js';
import * as images from '../src/image-characters.js';
import * as illustrations from '../src/illustration-plans.js';
import { isComicReply } from '../src/comic.js';
import { parseImageMarkers } from '../src/marker-generation.js';

const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const start=runtime.indexOf(a),end=runtime.indexOf(b,start);assert(start>=0&&end>start,a);return runtime.slice(start,end);};
const generated=vm.runInNewContext(part('// 自动人物建档与外貌方案版本','// 只调度当前聊天')+'\n({createAutoCharacterProfiles,profileAppearance,manualAppearance,currentAppearancePreset,renderAppearancePresets})',{...images,isComicReply,parseImageMarkers});
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function setup(code) {
    let data=M.emptyData(),context={chatId:'profiles',characterId:0,name1:'旅人',characters:[{name:'主角',avatar:'main.png',description:'主角黑发灰眼。'}],chat:[{name:'主角',mes:'新人甲走进咖啡馆。阿甲向主角点头。',swipe_id:0}]};
    data.characters['char:main.png']={key:'char:main.png',kind:'char',name:'主角',appearance:[{en:'black hair',zh:'黑发'}],outfits:[],outfitMode:'story',negative:''};
    const calls=[],warnings=[];let hold=null,failSave=false,saves=0;
    let response={people:[{name:'新人甲',aliases:['阿甲'],evidence:'新人甲走进咖啡馆。',appearance:['1boy','blond hair','blue eyes','looking at viewer','standing'],outfit:['white shirt'],inferred:true},{name:'主角',evidence:'阿甲向主角点头。',appearance:['pink hair']}]};
    const C=vm.runInNewContext(part('const __mod_chars =','// Marker-triggered generation')+'\n__mod_chars',{
        ...images,...illustrations,__mod_model:M,__mod_store:{getData:()=>data,commit(){}},__mod_nai:{settings:()=>({naiMode:'site',novelaimode:'nai-diffusion-4-5-full'})},__mod_engine:{composeStudio:({pos,neg})=>({positive:pos,negative:neg})},__mod_translate:{hasChinese:()=>false},SillyTavern:{getContext:()=>context},structuredClone,toastr:{info(){}},console,
    });
    const deps={getContext:()=>context,getData:()=>data,characters:C,settings:()=>({start:'image###',end:'###'}),uid:M.uid,pickJson:JSON.parse,
        askLLM:async(system,user,options)=>{calls.push({system,user:JSON.parse(user),options});if(hold)await hold;return JSON.stringify(response);},commit:async()=>{saves++;if(failSave)throw Error('合成保存失败');},notify:message=>warnings.push(message)};
    const profiles=code.createAutoCharacterProfiles(deps);
    return {profiles,deps,C,calls,warnings,get data(){return data;},get context(){return context;},get saves(){return saves;},response:value=>{response=value;},hold:value=>{hold=value;},failSave:value=>{failSave=value;},reload(){data=M.normalizeData(JSON.parse(JSON.stringify(data)));},switchChat(){context={...context,chatId:'other',chat:[{name:'主角',mes:'另一段剧情'}]};profiles.chatChanged();}};
}
for(const [label,code]of [['源码',original],['发布代码',generated]]) {
    // 保存方案独立于最近历史；手动替换不调用 AI，也不覆盖其他角色或原有衣柜。
    const saved=setup(code),savedKey='char:main.png',snapshot=JSON.stringify(saved.C.getChar(savedKey).appearance);
    await saved.profiles.savePreset(savedKey,'黑发原版');
    const first=saved.C.getChar(savedKey).appearancePresets[0].id;
    assert.equal(code.currentAppearancePreset(saved.C.getChar(savedKey)).id,first);
    const savedCount=saved.saves;
    await saved.profiles.applyPreset(savedKey,first);
    assert.equal(saved.saves,savedCount,'重复点当前方案不写入或新增历史');
    const translated=JSON.parse(JSON.stringify(saved.C.getChar(savedKey)));translated.appearance[0].zh='新翻译';
    assert.equal(code.currentAppearancePreset(translated).id,first);
    translated.appearance[0].en='new hair';assert.equal(code.currentAppearancePreset(translated),null,'手动修改不保留虚假高亮');
    await saved.profiles.replaceAppearance(savedKey,'1boy, 1.2::silver hair, blue eyes::\n freckles');
    assert.equal(saved.C.getChar(savedKey).appearance.length,3);
    assert.equal(saved.C.getChar(savedKey).appearance[1].en,'1.2::silver hair, blue eyes::');
    await saved.profiles.savePreset(savedKey,'银发版');
    await assert.rejects(saved.profiles.savePreset(savedKey,'银发版'),/同名/);
    assert.equal(saved.calls.length,0,'手动存取不调用 AI');
    await saved.profiles.applyPreset(savedKey,first);
    assert.equal(JSON.stringify(saved.C.getChar(savedKey).appearance),snapshot,'使用方案替换整个数组');
    await saved.profiles.clearAppearance(savedKey);
    assert.equal(saved.C.getChar(savedKey).appearance.length,0);
    await saved.profiles.select(savedKey,saved.C.getChar(savedKey).autoProfile.active-1);
    assert.equal(JSON.stringify(saved.C.getChar(savedKey).appearance),snapshot,'清空前标签能恢复');
    for(let i=0;i<12;i++)await saved.profiles.replaceAppearance(savedKey,'black hair, mark '+i);
    assert.equal(saved.C.getChar(savedKey).autoProfile.versions.length,10);
    assert.equal(saved.C.getChar(savedKey).appearancePresets.length,2,'历史淘汰不影响命名方案');
    saved.reload();await saved.profiles.applyPreset(savedKey,first);
    assert.equal(JSON.stringify(saved.C.getChar(savedKey).appearance),snapshot,'重载后方案仍能使用');
    saved.C.getChar(savedKey).appearance[0].en='modified';
    assert.equal(JSON.stringify(saved.C.getChar(savedKey).appearancePresets[0].appearance),snapshot,'当前标签与保存方案不共享引用');
    let snapshotAll=JSON.stringify(saved.C.getChar(savedKey));saved.failSave(true);
    for(const operation of [()=>saved.profiles.savePreset(savedKey,'失败方案'),()=>saved.profiles.applyPreset(savedKey,first),()=>saved.profiles.clearAppearance(savedKey),()=>saved.profiles.replaceAppearance(savedKey,'blue hair')]){
        await assert.rejects(operation(),/保存失败/);assert.equal(JSON.stringify(saved.C.getChar(savedKey)),snapshotAll,'保存失败完整回滚');
    }
    saved.failSave(false);
    await assert.rejects(saved.profiles.replaceAppearance(savedKey,'1.2::black hair'),/没有成对/);
    await assert.rejects(saved.profiles.replaceAppearance(savedKey,''),/粘贴英文/);
    assert.equal(JSON.stringify(saved.C.getChar(savedKey)),snapshotAll);
    const lock=defer();saved.hold(lock.promise);saved.response({appearance:['1boy','pink hair']});
    const running=saved.profiles.revise(savedKey);
    assert.equal(await saved.profiles.clearAppearance(savedKey),false,'AI 操作中阻止手动覆盖');lock.resolve();await running;saved.hold(null);
    assert.equal(saved.C.getChar(savedKey).appearancePresets.length,2,'AI 修改保留命名方案');saved.profiles.stop();
    const h=setup(code),beforeMain=JSON.stringify(h.data.characters['char:main.png']);
    const initial=h.profiles.scan(0);
    assert.equal(h.profiles.scan(0),initial,'同楼并发只请求一次');
    const keys=await initial;assert.equal(keys.length,1);const key=keys[0];
    assert.equal(JSON.stringify(h.data.characters['char:main.png']),beforeMain,'已有外貌保持用户定义');
    assert.equal(h.C.freeChars().length,1);assert(h.C.currentCast().some(row=>row.key===key&&row.on));
    assert(h.data.characters[key].appearance.some(tag=>tag.en==='blond hair'));
    assert(!h.data.characters[key].appearance.some(tag=>tag.en==='looking at viewer'||tag.en==='standing'));
    assert.equal(h.data.characters[key].outfits[0].tags[0].en,'white shirt');
    h.context.chat[0].mes+='\nimage###cafe, book###\n';
    await h.profiles.scan(0);assert.equal(h.calls.length,1,'插图标记插入后仍复用人物识别结果');
    h.reload();const reloaded=code.createAutoCharacterProfiles(h.deps);
    await reloaded.scan(0);assert.equal(h.calls.length,1,'重载后复用已扫描楼层');reloaded.stop();

    h.response({appearance:[{en:'1boy',zh:'男性'},{en:'silver hair',zh:'银发'},{en:'blue eyes',zh:'蓝眼'}]});
    assert(await h.profiles.revise(key,'头发改成银色，保留蓝色眼睛'));
    assert.equal(h.calls.at(-1).user.mode,'modify');assert.equal(h.calls.at(-1).user.requirement,'头发改成银色，保留蓝色眼睛');
    assert.equal(h.data.characters[key].autoProfile.versions.length,2);assert.equal(h.data.characters[key].autoProfile.active,1);
    let request=h.C.markerPrompt('Scene Composition: sfw, cafe; Character 1 Prompt: $阿甲-sfw-upperbody$, looking at book|centers:0.5,0.5');
    assert(request.chars[0].prompt.includes('silver hair'));assert(!request.chars[0].prompt.includes('blond hair'));
    const compile=code===original?illustrations.compileIllustrationPlan:vm.runInNewContext(part('// The entire editable instruction','function createIllustrationPlanner')+'\ncompileIllustrationPlan',images);
    const plan=compile({source:'新人甲走进咖啡馆。',title:'进门',moment:'进门一刻',rating:'sfw',scene:'cafe',composition:{shot:'medium shot',camera:'eye level',layout:'balanced composition',lighting:'warm light'},characters:[{name:'新人甲',registered:false,appearance:'green hair',gender:'boy',pose:'standing'}]},h.C.currentCast(),'新人甲走进咖啡馆。');
    assert.equal(plan.picks[0].char.key,key);assert(!plan.picks[0].tags.includes('green hair'),'已自动建档的人物使用库中的选定方案');
    await h.profiles.select(key,0);assert(h.data.characters[key].appearance.some(tag=>tag.en==='blond hair'));
    h.response({appearance:['1boy','black hair','grey eyes']});await h.profiles.revise(key);
    assert.equal(h.calls.at(-1).user.mode,'reroll');assert(h.C.getChar(key).appearance.some(tag=>tag.en==='black hair'));
    h.C.getChar(key).appearance.push({en:'freckles',zh:'雀斑'});
    await h.profiles.select(key,0);const manualIndex=h.C.getChar(key).autoProfile.versions.length-1;
    await h.profiles.select(key,manualIndex);assert(h.C.getChar(key).appearance.some(tag=>tag.en==='freckles'),'手动标签也可切回');
    h.response({appearance:[...h.C.getChar(key).appearance].reverse()});await assert.rejects(h.profiles.revise(key),/相同/);
    const before=JSON.stringify(h.C.getChar(key));h.failSave(true);h.response({appearance:['1boy','brown hair']});
    await assert.rejects(h.profiles.revise(key,'改成棕发'),/保存失败/);assert.equal(JSON.stringify(h.C.getChar(key)),before);h.failSave(false);
    const wait=defer();h.hold(wait.promise);const editing=h.profiles.revise(key,'换成红发');
    assert.equal(await h.profiles.revise(key,'重复点击'),false);
    h.C.getChar(key).appearance.push({en:'glasses',zh:'眼镜'});wait.resolve();
    await assert.rejects(editing,/已变化/);assert(h.C.getChar(key).appearance.some(tag=>tag.en==='glasses'));h.hold(null);
    assert.equal(h.profiles.isBusy(key),false);
    h.profiles.stop();

    for(const change of ['chat','swipe','body','stop','save']) {
        const other=setup(code),barrier=defer();other.hold(barrier.promise);
        const task=other.profiles.scan(0);
        if(change==='chat')other.switchChat();
        if(change==='swipe')other.context.chat[0].swipe_id=1;
        if(change==='body')other.context.chat[0].mes='用户修改了这段正文';
        if(change==='stop')other.profiles.stop();
        if(change==='save')other.failSave(true);
        barrier.resolve();await task;
        assert.equal(other.C.freeChars().length,0,change+' 时首建结果不覆盖当前数据');
        assert.equal(Object.keys(other.data.chatCast).length,0);
        other.profiles.stop();
    }
    const disabled=setup(code);disabled.data.options.autoCharacterProfiles=false;
    await disabled.profiles.scan(0);assert.equal(disabled.calls.length,0);
    await disabled.profiles.scan(0,{manual:true,force:true});assert.equal(disabled.C.freeChars().length,1);disabled.profiles.stop();
    const resumed=setup(code),pendingScan=defer();resumed.hold(pendingScan.promise);const oldJob=resumed.profiles.scan(0);resumed.profiles.chatChanged();pendingScan.resolve();await oldJob;resumed.hold(null);await resumed.profiles.scan(0);assert.equal(resumed.C.freeChars().length,1,'聊天重载后可重新识别同一消息对象');resumed.profiles.stop();
    const canon=setup(code),canonKey='char:main.png';canon.data.characters[canonKey].canonOn=true;canon.data.characters[canonKey].canonTag='fixture character';canon.data.characters[canonKey].canonKeepLook=false;
    canon.response({appearance:['1boy','silver hair']});await canon.profiles.revise(canonKey,'改成银发');
    assert.equal(canon.C.getChar(canonKey).canonTag,'fixture character');assert.equal(canon.C.getChar(canonKey).canonKeepLook,true);assert(canon.C.lookTags(canon.C.getChar(canonKey)).includes('silver hair'));canon.profiles.stop();
    console.log('PASS '+label+' 自动首建、别名、存库与重载、自然语言、外貌重roll、手动历史、角色实际请求、去重和在途保护');
}
assert(runtime.includes("fn:'look'"));assert(runtime.includes('uid:__mod_model.uid'));
assert(runtime.includes('await profiles.scan(Number(id))'));
assert(runtime.includes('prepare:id=>profiles.scan(id,{manual:true})'));
const integrated=setup(original),steps=[],queued=[];
const entrySandbox={...original,SillyTavern:{getContext:()=>integrated.context},getData:()=>integrated.data,C:integrated.C,__mod_marker:{settings:()=>({start:'image###',end:'###'})},__mod_model:M,
    __mod_translate:{askLLM:integrated.deps.askLLM,pickJson:JSON.parse},__mod_store:{commit:integrated.deps.commit},UI:{refreshProfiles(){},modal(){},esc:String,previewProfile(){}},cleanups:[],toastr:{info(){}},console};
const gateway=vm.runInNewContext(part('    const profiles = createAutoCharacterProfiles({','    const illustrationPlanner = createIllustrationPlanner({')+'\nprofileGateway',entrySandbox);
const onReply=vm.runInNewContext(part('    const onCharMsg = id => {','    for (const [ev, fn] of [[event_types.USER_MESSAGE_RENDERED')+'\nonCharMsg',{
    profiles:gateway,SillyTavern:{getContext:()=>integrated.context},C:integrated.C,getData:()=>integrated.data,stopped:false,
    comic:{render(){},async process(){assert.equal(integrated.C.freeChars().length,1);steps.push('comic');}},__mod_marker:{async process(){assert.equal(integrated.C.freeChars().length,1);steps.push('marker');}},illustAfter:async()=>{steps.push('illustration');},setTimeout:fn=>queued.push(fn),addMesButtons(){},console,
});
onReply(0);await queued[0]();assert.equal(integrated.calls[0].options.fn,'look');assert.equal(steps.join(','),'comic,marker,illustration');
const previews=[];
const preview=vm.runInNewContext(part('async function previewProfile(key)','return { previewProfile,')+'\npreviewProfile',{charAction:async(...args)=>previews.push(args)});
await preview('fixture-key');assert.equal(previews[0][0],'openchar');assert.equal(previews[0][1].dataset.key,'fixture-key');assert.equal(previews[1][0],'chartest');
gateway.stop();
console.log('PASS 正文事件、自动插图、漫画和手动标记生图均接入建档准备');
