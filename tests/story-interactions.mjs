// 从正文画面方案一路验证到实际发布的角色合并与 NAI 请求参数。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { preferStoryTags } from '../src/story-interactions.js';
import * as original from '../src/illustration-plans.js';
import * as imageCharacters from '../src/image-characters.js';

const runtime = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const part = (from, to) => { const start=runtime.indexOf(from),end=runtime.indexOf(to,start); assert(start>=0&&end>start,from); return runtime.slice(start,end); };
const M = vm.runInNewContext(part('const __mod_model =', '// ───── store.js') + '\n__mod_model', { structuredClone });
const generated = vm.runInNewContext(part('// The entire editable instruction', 'function createIllustrationPlanner')
    + '\n({compileIllustrationPlan,illustrationMarkerText,illustrationRequest,illustrationPrompt,DEFAULT_ILLUSTRATION_PROMPT})', imageCharacters);
const normalizeNaiChars = vm.runInNewContext(runtime.match(/function normalizeNaiChars\([\s\S]*?\n}\n/)[0] + '\nnormalizeNaiChars');
const settings = { naiMode:'site', novelaimode:'nai-diffusion-4-5-full', naiSiteSimple:'false' };
const buildParameters = vm.runInNewContext(runtime.match(/function buildParameters\([\s\S]*?\n}\n/)[0] + '\nbuildParameters', { normalizeNaiChars, settings:()=>settings, randomSeed:()=>42, skipSigma:()=>null, ucpValue:()=>'' });

const fixed = '1.3::black hair, looking_at_viewer, standing, arms at sides::, artist:fixture, running water, best quality';
let cleaned = preferStoryTags(fixed, 'sitting up straight, looking at smartphone, right hand reaching for smartphone', M);
assert(!cleaned.includes('looking_at_viewer')); assert(!cleaned.includes('standing')); assert(!cleaned.includes('arms at sides'));
assert(cleaned.includes('1.3::black hair::')); assert(cleaned.includes('artist:fixture')); assert(cleaned.includes('running water'));
assert(preferStoryTags('looking at viewer', 'sharp cold gaze, watching calmly', M).includes('looking at viewer'), '含糊视线不触发猜测');
assert(preferStoryTags('-1::looking at viewer::', 'looking at phone', M).includes('-1::looking at viewer::'), '负权重原样保留');
assert(preferStoryTags('standing', 'running water', M).includes('standing'), '场景词不误判为人体姿势');

const data = M.emptyData();
const context = { chatId:'interaction-fixture', getCurrentChatId:()=> 'interaction-fixture', characters:[], chat:[], extensionSettings:{} };
const a = { key:'a', kind:'free', name:'褚星澜', appearance:[{en:'1boy'},{en:'black hair'},{en:'looking at viewer'},{en:'standing'},{en:'arms at sides'}], outfits:[], outfitMode:'story', negative:'fixture-negative' };
const b = { ...structuredClone(a), key:'b', name:'墨辞', appearance:[{en:'1boy'},{en:'grey hair'},{en:'looking at viewer'},{en:'standing'},{en:'arms at sides'}] };
data.characters.a=a; data.characters.b=b;
data.chatCast['interaction-fixture']={a:true,b:true};
const group = M.createFromString(data,{name:'合成画风',text:'artist:fixture, 1.2::looking at viewer, front view, standing, arms at sides::, best quality',forceGroup:true});
data.active={type:'group',id:group.id};
data.options.chatPositive='looking at viewer, front view, arms at sides, cinematic lighting';
const sandbox = { ...imageCharacters, ...original, __mod_model:M, __mod_store:{getData:()=>data,commit(){}}, __mod_nai:{settings:()=>settings},
    __mod_engine:{composeStudio:({pos='',neg=''})=>({positive:pos,negative:neg})}, __mod_translate:{hasChinese:()=>false}, SillyTavern:{getContext:()=>context}, structuredClone, console, toastr:{info(){}} };
const C = vm.runInNewContext(part('const __mod_chars =', '// Marker-triggered generation') + '\n__mod_chars', sandbox);
const story = '褚星澜坐在沙发上伸手拿手机，墨辞站在后方看着他。';
const plan = { source:story, title:'来电', moment:'拿起手机的瞬间', rating:'sfw', scene:'indoor, smartphone on table', composition:{shot:'medium shot',camera:'side view',layout:'layered composition',lighting:'dim lighting'}, interaction:'seated man in foreground, standing man in background', characters:[
    { name:'褚星澜', registered:true,gender:'boy',pose:'sitting up straight',action:'reaching for smartphone',expression:'composed',gaze:'looking down',gaze_target:'smartphone',body_direction:'facing table',head_direction:'head down',hands:'right hand reaching for smartphone',outfit:'charcoal suit',position:{x:0.6,y:0.5,depth:'foreground'} },
    { name:'墨辞',registered:true,gender:'boy',pose:'standing',action:'watching calmly',expression:'calm',gaze:'looking at another',gaze_target:'seated man',body_direction:'facing seated man',head_direction:'head turned to the right',hands:'arms at sides',outfit:'grey tank top',position:{x:0.3,y:0.45,depth:'background'} },
] };
plan.scene_description = 'The standing man watches the seated man reach toward the phone on the table.';
plan.characters[0].action_description = 'His right hand is above the phone but has not grasped it yet.';
for (const [label, code] of [['源码', original], ['发布代码', generated]]) {
    const compiled = code.compileIllustrationPlan(plan, [{on:true,char:a},{on:true,char:b}], story);
    assert.match(compiled.picks[0].tags,/looking at smartphone/);
    assert.match(compiled.picks[1].tags,/looking at seated man/);
    assert.match(compiled.picks[0].tags,/right hand reaching for smartphone/);
    assert.match(compiled.picks[0].tags,/facing table/);
    for (const simple of [false,true]) {
        data.options.chatNoSplit=simple;
        const sent = C.markerPrompt(code.illustrationMarkerText(compiled), {story});
        const payload = buildParameters(sent);
        const positive = JSON.stringify({base:payload.v4_prompt.caption.base_caption,characters:payload.v4_prompt.caption.char_captions});
        assert(!positive.includes('looking at viewer')); assert(!positive.includes('front view'));
        assert(positive.includes(plan.scene_description), '英文场景关系说明进入实际请求');
        assert(positive.includes(plan.characters[0].action_description), '个人动作句在分栏与合并请求均保留');
        assert(positive.includes('looking at smartphone')); assert(positive.includes('looking at seated man')); assert(positive.includes('cinematic lighting')); assert(positive.includes('artist:fixture'));
        if (!simple) {
            assert(sent.chars[0].prompt.includes(plan.characters[0].action_description));
            assert(!sent.chars[1].prompt.includes(plan.characters[0].action_description), '个人动作不串到另一人');
            assert(!sent.positive.includes(plan.characters[0].action_description), '个人动作不重复灌入公共场景');
            assert(!sent.chars[0].prompt.includes('standing')); assert(!sent.chars[0].prompt.includes('arms at sides'));
            assert(sent.chars[1].prompt.includes('standing')); assert(sent.chars[1].prompt.includes('arms at sides'));
        }
        assert.equal(a.appearance[2].en,'looking at viewer'); assert.equal(data.options.chatPositive,'looking at viewer, front view, arms at sides, cinematic lighting');
    }
    data.options.chatNoSplit=false;
    // 自动方案里的换行、分号进入实际 NAI 参数；两个人的动作句不能串栏。
    const prose=structuredClone(plan);
    prose.scene_description='A phone rings;\r\n the men turn toward the table.';
    prose.characters[0].action_description='He reaches down;\n his right hand stays above the phone.';
    prose.characters[1].action_description='He watches quietly.\tHis hands remain at his sides.';
    for (const simple of [false,true]) {
        data.options.chatNoSplit=simple;
        const marker=code.illustrationMarkerText(code.compileIllustrationPlan(prose,[{on:true,char:a},{on:true,char:b}],story));
        const payload=buildParameters(C.markerPrompt(marker,{story}));
        const base=payload.v4_prompt.caption.base_caption;
        const chars=payload.v4_prompt.caption.char_captions;
        const all=JSON.stringify({base,chars});
        assert(all.includes('A phone rings, the men turn toward the table.'));
        assert(all.includes('He reaches down, his right hand stays above the phone.'));
        assert(all.includes('He watches quietly. His hands remain at his sides.'));
        if(!simple){
            assert.equal(chars.length,2);
            assert(chars[0].char_caption.includes('He reaches down,'));
            assert(!chars[1].char_caption.includes('He reaches down,'));
            assert(!base.includes('He reaches down,'));
        }
    }
    data.options.chatNoSplit=false;
    const mutual = structuredClone(plan);
    mutual.interaction='face-to-face, eye contact';
    mutual.characters.forEach(person=>{person.pose='standing';person.action='hugging';person.gaze='looking at another';person.gaze_target='other person';person.hands='arms around another';person.interaction_role='mutual#hug';});
    const result=C.markerPrompt(code.illustrationMarkerText(code.compileIllustrationPlan(mutual,[{on:true,char:a},{on:true,char:b}],story)));
    assert(result.chars.every(person=>person.prompt.includes('mutual#hug')&&person.prompt.includes('arms around another')));
    const closed=structuredClone(plan); closed.characters[0].gaze='eyes closed';
    assert(!code.compileIllustrationPlan(closed,[{on:true,char:a},{on:true,char:b}],story).picks[0].tags.includes('looking at smartphone'));
    const custom='玩家自己的完整提示词\n保持原样';
    assert.equal(code.illustrationPrompt({illustPrompt:custom}),custom);
    const legacy = fs.readFileSync(new URL('../src/illustration-plans.js',import.meta.url),'utf8').match(/const ILLUSTRATION_PROMPT_BASE = `([\s\S]*?)`;/)[1];
    assert.equal(code.illustrationPrompt({illustPrompt:legacy}),code.DEFAULT_ILLUSTRATION_PROMPT);
    for (const mode of ['inline','after']) {
        const request=code.illustrationRequest({options:{},mode,roster:[],markers:{start:'image###',end:'###'},story});
        assert(request.system.includes('谁对谁做什么')); assert(request.system.includes('gaze_target')); assert(request.system.includes('source#hug'));
    }
    console.log('PASS '+label+' 手机观察场景、互动双方与手部、姿势优先、固定词权重、分角色及合并请求、默认迁移与自定义提示词');
}
const portrait = C.buildChatPrompt('sfw, portrait', [{char:a,tags:'looking at viewer, standing, arms at sides',x:0.5,y:0.5}]);
assert(portrait.chars[0].prompt.includes('looking at viewer'));
assert(portrait.chars[0].prompt.includes('standing'));
console.log('PASS 明确看镜头和站立的画面继续沿用本次指令');
