// 验证分镜风格、留白方案进入真实改编入口，并保留在途选择与旧分镜。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as original from '../src/comic.js';
import * as layouts from '../src/comic-layouts.js';

const runtime = fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const generated = vm.runInNewContext(runtime.slice(runtime.indexOf('const COMIC_BLOCK'),runtime.indexOf('// The entire editable instruction'))
    + '\n({adaptRequest,rewriteRequest,parseAdapt,comicBlocks,parseComicPage,validateComicLayout,createComicController,COMIC_PANEL_STYLES,COMIC_GUTTERS,resolveComicLayout,comicLayoutExample})', {console,setTimeout,clearTimeout});
const codeSource = { ...original, ...layouts };
const defer = () => { let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve}; };

for (const [label,code] of [['源码',codeSource],['发布代码',generated]]) {
    assert.equal(code.COMIC_PANEL_STYLES.length,8);
    assert.equal(code.COMIC_GUTTERS.length,5);
    for (const style of code.COMIC_PANEL_STYLES) for (const gutter of code.COMIC_GUTTERS) {
        const options = {panelStyle:style.id,gutter:gutter.id,panels:'1–2'};
        const request=code.adaptRequest('角色在车站相遇并归还书本。',options);
        if(style.rule)assert(request.system.includes(style.rule));
        if(gutter.rule)assert(request.system.includes(gutter.rule));
        for(const other of code.COMIC_PANEL_STYLES.filter(item=>item.rule&&item.id!==style.id))assert(!request.system.includes(other.rule));
        for(const other of code.COMIC_GUTTERS.filter(item=>item.rule&&item.id!==gutter.id))assert(!request.system.includes(other.rule));
        const example=request.system.slice(request.system.indexOf('多页格式示例'));
        const pages=code.comicBlocks(example);
        assert.equal(pages.length,2);
        assert(pages.every(page=>code.parseComicPage(page.inner).panelTexts.length===(style.id==='yonkoma'?4:2)));
        if(style.id==='yonkoma')assert.equal(JSON.stringify(code.parseComicPage(pages[0].inner).boxes.map(box=>box.y)),JSON.stringify([0,0.25,0.5,0.75]),'纵向四格叠字按四层排列');
        if(style.id==='yonkoma')assert(request.user.includes('每页 4 格'));
        else assert(request.user.includes('每页 1–2 格'));
        const rewrite=code.rewriteRequest(code.comicLayoutExample(),1,'保持剧情',options);
        if(style.rule)assert(rewrite.system.includes(style.rule));
        if(gutter.rule)assert(rewrite.system.includes(gutter.rule));
    }
    assert.equal(code.resolveComicLayout({panelStyle:'old-invalid',gutter:'old-invalid'}).style.id,'universal');
    assert.equal(code.resolveComicLayout({}).gutter.id,'follow');
    assert.throws(()=>code.validateComicLayout(code.comicLayoutExample(),{panelStyle:'yonkoma'}),/4 格/);
    assert.doesNotThrow(()=>code.validateComicLayout(code.comicLayoutExample({panelStyle:'yonkoma'}),{panelStyle:'yonkoma'}));
    let options={comicPanelStyle:'yonkoma',comicGutter:'boxed',comicPanels:'1–2'},context={chatId:'layouts',chat:[{name:'合成角色',mes:'角色在咖啡馆等雨，之后走出咖啡馆。'}],saveChat:async()=>{saves++;}};
    let saves=0,hold=null,response=code.comicLayoutExample({panelStyle:'yonkoma'}).replaceAll('comic page,','white border, comic page,');
    const requests=[],draws=[],notices=[];
    const doc={defaultView:{setTimeout,clearTimeout},head:{appendChild(){}},createElement:()=>({remove(){}}),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}};
    const controller=code.createComicController({document:doc,getContext:()=>context,getData:()=>({options}),esc:String,notify:m=>notices.push(m),
        askLLM:async(system,user)=>{requests.push({system,user});if(hold)await hold;return response;},generatePage:async request=>{draws.push(request);return {image:'synthetic'};},storeImage:async()=>({url:'synthetic.png'})});
    const wait=defer();hold=wait.promise;
    const first=controller.adapt(0);
    options.comicPanelStyle='shounen';options.comicGutter='ink';
    wait.resolve();await first;hold=null;
    assert(requests[0].system.includes('所选分镜风格为「经典四格」'));
    assert(requests[0].system.includes('所选留白方案为「全封闭内框」'));
    assert.equal(draws.length,2);
    assert(draws.every(request=>request.positive.includes('4 panels')&&request.positive.includes('white border')));
    const saved=context.chat[0].extra.zhikuComicSrc['0'];
    await controller.redrawAll(0);
    assert.equal(requests.length,1,'保留分镜重画继续复用已存布局');
    assert.equal(context.chat[0].extra.zhikuComicSrc['0'],saved);
    context.chat.push({name:'合成角色',mes:'角色在街上归还书本。'});
    response=code.comicLayoutExample();
    await controller.adapt(1);
    assert(requests[1].system.includes('所选分镜风格为「少年热血」'));
    assert(requests[1].system.includes('所选留白方案为「纯黑线无白边」'));
    options.comicPanelStyle='yonkoma';
    const before=JSON.stringify(context.chat[0]),beforeDraws=draws.length,beforeSaves=saves;
    await controller.adapt(0,{redo:true});
    assert.equal(JSON.stringify(context.chat[0]),before,'四格校验失败保留已存数据');
    assert.equal(draws.length,beforeDraws);assert.equal(saves,beforeSaves);
    assert(notices.some(message=>message.includes('4 格')));
    controller.stop();
    console.log('PASS '+label+' 8 分镜选择 × 5 留白方案、四格示例和校验、单页重写、在途快照、重画复用与失败回滚');
}
const model=vm.runInNewContext(runtime.slice(runtime.indexOf('const __mod_model ='),runtime.indexOf('// ───── store.js'))+'\n__mod_model',{structuredClone});
const data=model.emptyData();data.options.comicPanelStyle='seinen';data.options.comicGutter='fullbleed';
const reloaded=model.normalizeData(JSON.parse(JSON.stringify(data)));
assert.equal(reloaded.options.comicPanelStyle,'seinen');assert.equal(reloaded.options.comicGutter,'fullbleed');
console.log('PASS 实际存档归一化与重载保留分镜和留白选择');
