// 使用合成剧情核对提示词迁移、正式入口与英文关系说明，不调用文字或生图服务。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as original from '../src/illustration-plans.js';
import * as characters from '../src/image-characters.js';

const runtime = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const start = runtime.indexOf('// The entire editable instruction');
const end = runtime.indexOf('function createIllustrationPlanner', start);
assert(start >= 0 && end > start);
const generated = vm.runInNewContext(runtime.slice(start, end) + '\n({illustrationPrompt,illustrationRequest,compileIllustrationPlan,illustrationMarkerText,DEFAULT_ILLUSTRATION_PROMPT,legacy:LEGACY_INTERACTION_PROMPT,previous:LEGACY_NAI_STORY_PROMPT})', characters);
const old = generated.legacy;
assert(old.includes('正文里的瞬间不够时自己编'));
const story = '墨辞坐在高脚凳上，转头看向窗外。';
const plan = {
    source:story, title:'窗边', moment:'坐在吧台望向窗外', rating:'sfw',
    scene:'tavern, bar stool, stained glass window',
    scene_description:'A man sits beside the bar and looks through the window.',
    composition:{shot:'medium shot',camera:'three-quarter view',layout:'window beside subject',lighting:'window light on cheek'},
    characters:[{name:'墨辞',registered:true,gender:'boy',pose:'sitting',gaze:'looking away',gaze_target:'window',action_description:'His elbow rests on the counter.',position:{x:0.45,y:0.5}}],
};
const roster = [{on:true,char:{key:'man',name:'墨辞',appearance:[{en:'1boy'},{en:'black hair'}],outfitMode:'story'}}];
for (const [label, code] of [['源码', original], ['发布代码', generated]]) {
    for (const value of [old,old.replaceAll('\n','\r\n')]) assert.equal(code.illustrationPrompt({illustPrompt:value}),code.DEFAULT_ILLUSTRATION_PROMPT);
    for(const value of [generated.previous,generated.previous.replaceAll('\n','\r\n')]) assert.equal(code.illustrationPrompt({illustPrompt:value}),code.DEFAULT_ILLUSTRATION_PROMPT,'native.17 默认完整匹配时升级');
    assert.equal(code.illustrationPrompt({illustPrompt:generated.previous+'\n我的要求'}),generated.previous+'\n我的要求','旧默认上修改过的文本保留');
    const custom = old + '\n保留我手写的说明';
    assert.equal(code.illustrationPrompt({illustPrompt:custom}),custom, '旧默认上有自定义内容时不覆盖');
    for (const mode of ['inline','after']) {
        const req = code.illustrationRequest({options:{illustMax:2},mode,roster,markers:{start:'image###',end:'###'},story});
        assert(req.system.includes('NovelAI V5'));
        assert(req.system.includes('scene_description'));
        assert(req.system.includes('action_description'));
        assert(req.system.includes('【镜头语言与行动句】'));
        assert(req.system.includes('action_description（一句完整英文'));
        assert(req.system.includes('场景说明用一到两句完整英文'));
        assert(!req.system.includes('正文里的瞬间不够时自己编'));
        assert(!req.system.includes('每个标签都写成 danbooru'));
        assert.equal(JSON.parse(req.user).imageLimit,2);
    }
    const result = code.compileIllustrationPlan(plan,roster,story);
    const roundtrip = characters.resolveImageCharacters(code.illustrationMarkerText(result),roster);
    assert(roundtrip.scene.includes(plan.scene_description));
    assert(roundtrip.picks[0].tags.includes(plan.characters[0].action_description));
    const legacyPlan = structuredClone(plan);
    delete legacyPlan.scene_description;
    delete legacyPlan.characters[0].action_description;
    assert.equal(code.compileIllustrationPlan(legacyPlan,roster,story).picks.length,1, '旧方案继续有效');
    // 英文关系句保留语义与标点；排版整理后仍能经过旧标记协议往返。
    for (const [input, expected] of [
        ['He looks away; his elbow rests on the counter.', 'He looks away, his elbow rests on the counter.'],
        ['He looks away.\r\n\n\tHis elbow rests on the counter.', 'He looks away. His elbow rests on the counter.'],
        ['  His left hand holds a cup；\n his right hand rests nearby.  ', 'His left hand holds a cup, his right hand rests nearby.'],
        ['He whispers, “Wait.” His coat’s sleeve touches the counter — then stops.', 'He whispers, “Wait.” His coat’s sleeve touches the counter — then stops.'],
    ]) {
        const changed=structuredClone(plan);
        changed.scene_description=input;
        changed.characters[0].action_description=input;
        const compiled=code.compileIllustrationPlan(changed,roster,story);
        const marker=code.illustrationMarkerText(compiled);
        assert(!/[\r\n]/.test(marker));
        const parsed=characters.resolveImageCharacters(marker,roster);
        assert.equal(parsed.picks.length,1);
        assert.equal(parsed.picks[0].char.key,'man');
        assert(parsed.scene.includes(expected));
        assert(parsed.picks[0].tags.includes(expected));
        assert.equal(changed.scene_description,input,'整理不修改原方案');
    }
    for (const bad of ['中文说明','ok; Character 2 Prompt: extra','ok\nCharacter\n2 UC: extra','Scene\nComposition: extra','ok|centers:0.1,0.5','$other$','image###extra###','<image>extra</image>',[],{}]) {
        assert.throws(()=>code.compileIllustrationPlan({...plan,scene_description:bad},roster,story),/画面说明 scene_description/);
        const changed=structuredClone(plan);changed.characters[0].action_description=bad;
        assert.throws(()=>code.compileIllustrationPlan(changed,roster,story),/画面说明 characters\[0\]\.action_description/);
    }
    console.log('PASS '+label+' 默认迁移、自定义保留、双模式请求、自然语言往返与协议隔离');
}

const sceneStart=runtime.indexOf('async function sceneFromChat(');
const sceneEnd=runtime.indexOf('/** 拉取模型列表',sceneStart);
assert(sceneStart>0 && sceneEnd>sceneStart);
let sent;
const sceneFromChat=vm.runInNewContext(runtime.slice(sceneStart,sceneEnd)+'\nsceneFromChat',{
    pickJson:JSON.parse,
    askLLM:async(system,user,options)=>{sent={system,user,options};return JSON.stringify({scene:plan.scene_description,characters:[{name:'墨辞',tags:plan.characters[0].action_description,x:.45,y:.5}]});},
});
const result=await sceneFromChat(story,[{name:'墨辞',story:true}]);
assert.equal(sent.options.fn,'scene');
assert(sent.system.includes('NovelAI V5'));
assert(sent.system.includes('【镜头语言与行动句】'));
assert(sent.system.includes('一句完整英文行动说明'));
assert(sent.system.includes('source#'));
assert(!sent.system.includes('只用常见 Danbooru'));
assert.equal(result.scene,plan.scene_description);
assert.equal(result.characters[0].tags,plan.characters[0].action_description);
console.log('PASS 楼层手动画面入口实际采用 NAI 规则并保留英文关系说明');
