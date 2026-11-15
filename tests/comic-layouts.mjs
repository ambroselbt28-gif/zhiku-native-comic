// 验证旧模板停止生效，自由分镜与旧页重画兼容。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as original from '../src/comic.js';
import * as layouts from '../src/comic-layouts.js';
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const generated=vm.runInNewContext(runtime.slice(runtime.indexOf('const COMIC_BLOCK'),runtime.indexOf('// The entire editable instruction'))+'\n({adaptRequest,rewriteRequest,parseAdapt,comicBlocks,parseComicPage,createComicController,comicLayoutExample})',{console,setTimeout,clearTimeout});
for(const [label,code] of [['源码',{...original,...layouts}],['发布代码',generated]]){
    for(const panelStyle of ['universal','yonkoma','shounen','slice','seinen','comedy','shoujo','eromanga'])for(const gutter of ['follow','boxed','bleed','fullbleed','ink']){
        const options={panelStyle,gutter,panels:'1–2'};
        const req=code.adaptRequest('合成角色等雨后离开。',options);
        assert(req.user.includes('每页 1–2 格'));
        assert(req.system.includes('按剧情自由分镜'));
        assert(!req.system.includes('所选分镜风格'));assert(!req.system.includes('所选留白方案'));
        assert(!req.user.includes('每页 4 格'));
        const rewrite=code.rewriteRequest(code.comicLayoutExample(),1,'',options);
        assert(rewrite.system.includes('按剧情自由分镜'));
        assert(!rewrite.system.includes('所选分镜风格'));assert(!rewrite.system.includes('所选留白方案'));
    }
    assert(code.adaptRequest('合成剧情').user.includes('每页格数按本页剧情决定'));
    const examples=code.comicBlocks(code.comicLayoutExample());
    assert.equal(examples.length,2);assert.equal(code.parseComicPage(examples[0].inner).panels,2);assert.equal(code.parseComicPage(examples[1].inner).panels,1);
    const options={comicPanelStyle:'yonkoma',comicGutter:'boxed',comicPanels:'1–2'};
    const context={chatId:'synthetic',chat:[{name:'合成角色',mes:'角色在咖啡馆等雨，之后离开。'}],saveChat:async()=>{}};
    let response=code.comicLayoutExample();const requests=[],draws=[],notices=[];
    const doc={defaultView:{setTimeout,clearTimeout},head:{appendChild(){}},createElement:()=>({remove(){}}),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}};
    const controller=code.createComicController({document:doc,getContext:()=>context,getData:()=>({options}),esc:String,notify:m=>notices.push(m),askLLM:async(system,user)=>{requests.push({system,user});return response;},generatePage:async r=>{draws.push(r);return {image:'synthetic'};},storeImage:async()=>({url:'synthetic.png'})});
    await controller.adapt(0);assert.equal(draws.length,2);assert.equal(notices.length,0);
    assert(draws[0].positive.includes('asymmetric layout'));assert(draws[1].positive.includes('1 panel'));
    const saved=context.chat[0].extra.zhikuComicSrc['0'];await controller.redrawAll(0);
    assert.equal(requests.length,1);assert.equal(context.chat[0].extra.zhikuComicSrc['0'],saved);
    const before=JSON.stringify(context.chat[0]),count=draws.length;
    response='<image>@page broken';await controller.adapt(0,{redo:true});
    assert.equal(JSON.stringify(context.chat[0]),before);assert.equal(draws.length,count);assert(notices.some(m=>m.includes('没有写完')));
    response=code.comicLayoutExample().replaceAll('Character C1 (Ren)','Character C1 (Ren), revised');await controller.adapt(0,{redo:true});assert.equal(draws.length,count+2);
    controller.stop();console.log('PASS '+label+' 旧模板全部停用、独立格数、不同布局示例、正式改编/重画与失败保留');
}
const model=vm.runInNewContext(runtime.slice(runtime.indexOf('const __mod_model ='),runtime.indexOf('// ───── store.js'))+'\n__mod_model',{structuredClone});
const data=model.emptyData();data.options.comicPanelStyle='seinen';data.options.comicGutter='fullbleed';
const reloaded=model.normalizeData(JSON.parse(JSON.stringify(data)));
assert.equal(reloaded.options.comicPanelStyle,'seinen');assert.equal(reloaded.options.comicGutter,'fullbleed');
console.log('PASS 旧模板字段可留在存档中但不再参与生成');
