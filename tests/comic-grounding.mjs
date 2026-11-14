import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as source from '../src/comic.js';

const runtime=fs.readFileSync('runtime.js','utf8');
const generated=vm.runInNewContext(runtime.slice(runtime.indexOf('const COMIC_BLOCK'),runtime.indexOf('// The entire editable instruction'))+'\n({parseComicPage,comicRequest,comicGroundingWarnings,adaptRequest,rewriteRequest})',{console});
// 使用合成剧情复现日志中的布局与镜头冲突，不发布用户聊天和角色资料。
const page=`@page
rating:general, 1boy, 1girl, comic page, 4 panels, right-to-left reading, vertical layout, cafe
@panel P1
top right, close-up, smartphone screen
@character C1
boy, black hair, grey coat, holding a cup
Text: C2，你看这里。
@character C2
girl, silver hair, blue coat, holding smartphone, screen facing C1
@panel P2
top left, medium close-up, cafe interior
@character C2
girl, silver hair, blue coat, one foot kicking suitcase, then turning around
@panel P3
bottom right, medium shot, cafe window
@character C1
boy, black hair, grey coat, looking at the silver-haired girl
@character C2
girl, silver hair, blue coat, holding a cup
@panel P4
bottom left, close-up, rainy window
@character C2
girl, silver hair, blue coat, looking at C99`;

for(const [label,code] of [['源码',source],['发布代码',generated]]) {
    const parsed=code.parseComicPage(page), before=JSON.stringify(parsed);
    const req=code.comicRequest(parsed,{stylePos:'1.2::artist:fixture::',textMode:'overlay'});
    assert.equal(JSON.stringify(parsed),before,'组装请求不改已有分镜');
    assert.ok(req.positive.startsWith('1.2::artist:fixture::'));
    assert.ok(req.positive.includes('Character C1 is one recurring person'));
    assert.ok(req.positive.includes('Main characters in this panel: Character C1, Character C2.'));
    assert.equal(req.chars.length,6);
    for(const character of req.chars) {
        assert.match(character.prompt,/^This character appears in panel \d \(P\d\) only\./);
        assert.match(character.prompt,/\nCharacter C\d\.\n/);
        const panel=Number(character.prompt.match(/panel (\d)/)[1]);
        const box=parsed.anchors[panel-1];
        assert.ok(character.center.x>box.x&&character.center.x<box.x+box.w);
        assert.ok(character.center.y>box.y&&character.center.y<box.y+box.h);
        assert.ok(!character.prompt.includes('Text:'));
    }
    assert.ok(req.chars[0].prompt.includes('panel 2'),'日式右起阅读的画格仍保留编号，人物栏按空间排列');
    const duo=req.chars.filter(c=>c.prompt.includes('panel 1'));
    assert.notEqual(duo[0].center.x,duo[1].center.x);
    const drawn=code.comicRequest(parsed,{textMode:'draw'});
    assert.ok(drawn.chars.find(c=>c.prompt.includes('holding a cup')&&c.prompt.includes('panel 1')).prompt.endsWith('Text: C2，你看这里。'),'文字与编号不重写');
    assert.ok(code.comicRequest(parsed,{panelPositions:false}).chars.every(c=>!c.center));
    const warnings=code.comicGroundingWarnings(parsed);
    assert.ok(warnings.some(s=>s.includes('物件特写')));
    assert.ok(warnings.some(s=>s.includes('腿脚动作')));
    assert.ok(warnings.some(s=>s.includes('先后动作')));
    assert.ok(warnings.some(s=>s.includes('C99')));
    for(const unusual of ['asymmetric layout','diagonal panels','inset panel','double-page spread']) {
        const p=code.parseComicPage(page.replace('vertical layout',unusual));
        assert.equal(p.anchors,null);
        assert.ok(code.comicRequest(p).chars.every(c=>!c.center));
    }
    const manual=code.parseComicPage('@position manual\n'+page.replace('Text: C2，你看这里。','Text: C2，你看这里。\n@center 0.9,0.1'));
    assert.equal(code.comicRequest(manual).chars[0].center.x,0.9);
    assert.equal(code.comicRequest(manual,{panelPositions:false}).chars[0].center.y,0.1);
    for(const positions of [['top half','bottom half'],['top','middle','bottom'],['top quarter','upper middle quarter','lower middle quarter','bottom quarter']]) {
        const p=code.parseComicPage('@page\ncomic page, vertical layout\n'+positions.map((pos,i)=>`@panel P${i+1}\n${pos}, face close-up\n@character C1\nboy, black hair`).join('\n'));
        const r=code.comicRequest(p);
        assert.equal(r.chars.length,positions.length);
        assert.ok(r.chars.every(c=>c.center.x===0.5));
        for(let i=1;i<r.chars.length;i++)assert.ok(r.chars[i].center.y>r.chars[i-1].center.y);
    }
    assert.equal(code.parseComicPage(page.replace('top left,','top right,')).anchors,null,'重复画格位置不臆测坐标');
    const llm=code.adaptRequest('合成剧情',{extra:'保留我选择的画风'});
    assert.ok(llm.system.includes('每格只定格一个动作阶段'));
    assert.ok(llm.system.includes('不要只写 watching calmly'));
    assert.ok(llm.user.includes('保留我选择的画风'));
    const rewrite=code.rewriteRequest('<image>'+page+'</image>',1,'',{story:'合成原文：人物把手机交给同伴。'});
    assert.ok(rewrite.system.includes('手机屏幕特写'));
    assert.ok(rewrite.user.includes('<original_story readonly="true">'));
    assert.ok(rewrite.user.includes('修正镜头与动作冲突'));
    console.log('PASS '+label+' 漫画身份、人物定位、复杂布局回退、镜头冲突与 AI 改编约束');
}

const naiStart=runtime.indexOf('const __mod_nai ='),naiEnd=runtime.indexOf('const __mod_engine =',naiStart);
const config={naiMode:'key',nai3Scale:'5',novelaimode:'nai-diffusion-5-full'};
const nai=vm.runInNewContext(runtime.slice(naiStart,naiEnd)+'\n__mod_nai',{
    __shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},toastr:{info(){}},
});
const req=source.comicRequest(source.parseComicPage(page),{textMode:'overlay'});
const body=nai.buildParameters({...req,comic:true,seed:123});
assert.equal(body.use_coords,true);
assert.equal(body.v4_prompt.use_coords,true);
assert.equal(body.v4_prompt.caption.char_captions.length,6);
assert.equal(body.v4_negative_prompt.caption.char_captions.length,6);
assert.equal(body.scale,5);
assert.equal(body.seed,123);
assert.deepEqual(JSON.parse(JSON.stringify(body.v4_prompt.caption.char_captions.map(c=>c.centers[0]))),req.chars.map(c=>c.center));
console.log('PASS 正式 NAI 请求字段传递画格坐标与全部人物，不改 CFG 或种子');
