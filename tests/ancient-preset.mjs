import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAncientPreset} from '../src/ancient-preset.js';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('// 古风预设：'),source.indexOf('// 古风预设模块结束。'));
const generated=vm.runInNewContext(block+'\ncreateAncientPreset');
const plain=x=>JSON.parse(JSON.stringify(x));
for(const [label,make] of [['源码',createAncientPreset],['发布代码',generated]]){
    let n=0;const uid=p=>p+(++n);
    const original={id:'one',name:'我的预设 1',ents:[
        {id:'main',n:'主指令',r:'system',on:true,t:'你是流光，完成绘图任务。'},
        {id:'off',n:'未开启',r:'user',on:false,t:'用户关闭的规则',custom:{keep:1}},
        {id:'ctx',ctx:true,n:'上下文',r:'user',on:true},
        {id:'thought',n:'思维链',r:'system',on:true,t:'确认人数与每个人的方位。'}
    ]};
    const cfg={active:'one',list:{one:original},fn:{ill:{api:'private-api',model:'keep',extra:[{t:'既有功能要求'}]}},markOn:{charDescription:true}};
    const before=JSON.stringify(cfg);const {preset,created}=make(cfg,uid);
    assert(created);assert.equal(preset.name,'我的预设 1 · 古风');assert.equal(cfg.active,'one','创建函数不擅自切换');
    const restored=plain(cfg);delete restored.list[preset.id];assert.equal(JSON.stringify(restored),before,'原预设和 API 绑定完整保留');
    assert.equal(preset.ents.length,original.ents.length+2);assert.equal(preset.ents[2].n,'主提示词 · 古风角色卡');assert(preset.ents[3].ctx);
    assert.equal(preset.ents.at(-1).n,'思维链补充 · 古风画面规划');
    assert.equal(preset.ents[1].on,false);assert.equal(preset.ents[4].t,original.ents[3].t);
    preset.ents[1].custom.keep=2;assert.equal(original.ents[1].custom.keep,1,'深复制不共享自定义字段');
    preset.ents.at(-1).t+='用户修改';assert.equal(make(cfg,uid).preset.id,preset.id);assert(make(cfg,uid).preset.ents.at(-1).t.endsWith('用户修改'));
    cfg.active=preset.id;assert.equal(make(cfg,uid).created,false);
    const reloaded=plain(cfg);assert.equal(make(reloaded,uid).preset.id,preset.id,'重载后不重复创建');
    cfg.active='plain';assert.throws(()=>make(cfg,uid),/自定义预设/);
    const missing={active:'x',list:{x:{name:'自定义',ents:[{id:'main',t:'keep',on:true,r:'system'}]},other:{name:'自定义 · 古风',ents:[]}}};
    const made=make(missing,uid).preset;assert.equal(made.name,'自定义 · 古风 2');assert.equal(made.ents.filter(e=>e.ctx).length,1);
    console.log('PASS '+label+' 古风副本保留完整原条目/开关/API、独立编辑、重载去重与上下文补齐');
}
// 正式消息组装检查：古风仅在选中副本时进入请求，输出仍遵循当前功能协议。
const part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
let i=0;const cfg={active:'base',list:{base:{id:'base',name:'我的预设 1',ents:[{id:'main',r:'system',on:true,t:'流光原主指令'},{id:'ctx',ctx:true},{id:'think',r:'system',on:true,t:'原人数与位置检查'}]}},fn:{},markOn:{}};
const preset=generated(cfg,p=>'id'+(++i)).preset;
const data={aiPresets:cfg,options:{}},calls=[];
const T=vm.runInNewContext(part('const __mod_translate =','const __mod_chars =')+'\n__mod_translate',{
    __mod_store:{getData:()=>data},__shim:{getRequestHeaders:()=>({})},console,
    SillyTavern:{getContext:()=>({generateRaw:async request=>{calls.push(plain(request));return 'ok';}})}
});
for(const fn of ['ill','comic','cast','translate']){
    cfg.active=preset.id;await T.askLLM('当前功能格式：只输出 JSON','合成古风剧情',{fn});
    const messages=calls.at(-1).prompt;
    assert.equal(messages[0].content,'流光原主指令');
    assert.match(messages[1].content,/古风专用预设/);
    assert(messages.some(m=>/当前功能格式：[\s\S]*只输出 JSON/.test(m.content)));
    assert(messages.some(m=>m.content==='合成古风剧情'));
    assert.match(messages.at(-1).content,/不要输出思维链/);
    assert.match(messages.at(-1).content,/完整英文句子|自然英文/);
    cfg.active='base';await T.askLLM('只输出 JSON','合成现代剧情',{fn});
    assert(!JSON.stringify(calls.at(-1)).includes('古风专用预设'),'切回原预设不残留古风规则');
}
console.log('PASS 正式 AI 请求按选中预设注入古风主提示词/规划、任务协议保留与切回隔离');
