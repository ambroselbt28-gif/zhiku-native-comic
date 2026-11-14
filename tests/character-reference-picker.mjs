import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as source from '../src/character-reference-picker.js';

const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const from=runtime.indexOf('// 角色参考分组：'), to=runtime.indexOf('// 角色参考分组结束。',from);
assert(from>=0 && to>from);
const generated=vm.runInNewContext(runtime.slice(from,to)+'\n({partitionCharacterReferences,renderCharacterReferencePicker})');
assert(runtime.includes('renderCharacterReferencePicker(d, c, C.currentCast(), esc)'), '正式人物页接入分组');
const a={key:'char:a',kind:'char',avatar:'a',name:'主角甲',charRef:'ra'};
const side={key:'side:a',kind:'side',card:'a',name:'配角甲',charRef:'rs'};
const b={key:'char:b',kind:'char',avatar:'b',name:'主角乙',charRef:'rb'};
const sideB={key:'side:b',kind:'side',card:'b',name:'配角乙',charRef:'rsb'};
const free={key:'free:auto',kind:'free',name:'本聊天自动人物',charRef:'rf'};
const user={key:'user:me',kind:'user',name:'当前人设',charRef:'ru'};
const data={characters:Object.fromEntries([a,side,b,sideB,free,user].map(c=>[c.key,c])),charRefGroups:{}};
for(const id of ['ra','rs','rb','rsb','rf','ru','loose']) data.charRefGroups[id]={id,name:id,refs:[{path:id+'.png'}]};
const here=[a,side,free,user].map(char=>({key:char.key,char,on:false}));
const snapshot=JSON.stringify(data);
const ids=groups=>Array.from(groups,g=>g.id).sort();
const escape=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
for(const [label,code] of [['源码',source],['发布代码',generated]]) {
    for(const c of [a,side,free,user]) {
        const result=code.partitionCharacterReferences(data,c,here);
        assert.deepEqual(ids(result.local),['ra','rf','rs','ru']);
        assert.deepEqual(ids(result.other),['loose','rb','rsb']);
    }
    assert.deepEqual(ids(code.partitionCharacterReferences(data,b,here).local),['rb','rsb'], '浏览别张卡时按该卡归属显示');
    assert.deepEqual(ids(code.partitionCharacterReferences(data,a,[...here,{char:b}]).local),['ra','rb','rf','rs','rsb','ru'], '群聊包含成员卡与配角');
    assert.deepEqual(ids(code.partitionCharacterReferences(data,a,[]).local),['ra','rs'], '未打开聊天也保留当前卡家族');
    const selected={...a,charRef:'rb'};
    const result=code.partitionCharacterReferences(data,selected,here);
    assert(ids(result.local).includes('rb'));
    assert(!ids(result.other).includes('rb'), '已选跨卡参考可见且不重复');
    const html=code.renderCharacterReferencePicker(data,a,here,escape);
    assert(html.includes('data-other-charrefs'));
    assert(!/<details[^>]*\bopen\b/.test(html),'其他参考默认折叠');
    assert(html.includes('data-charrefup'));
    const weird={...data,charRefGroups:{...data.charRefGroups,loose:{id:'loose',name:'<img src=x>'}}};
    assert(!code.renderCharacterReferencePicker(weird,a,here,escape).includes('<img src=x>'));
    assert.equal(JSON.stringify(data),snapshot,'展示不修改参考组、绑定与图片');
    console.log('PASS '+label+' 当前卡/配角/自动人物/人设/群聊/异卡浏览/无聊天/跨卡已选/折叠与数据不变');
}
