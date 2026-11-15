import fs from 'node:fs';
import assert from 'node:assert/strict';
export function applyGenerationPause(source) {
    const patch=(from,to)=>{assert.equal(source.split(from).length,2,'暂停生图入口：'+from.slice(0,70));source=source.replace(from,()=>to);};
    patch('stopQueue:()=>{siteStopped=true;', 'queueControl:__naiGate, stopQueue:()=>{siteStopped=true;');
    const capture="const generationCurrent=globalThis.__zhikuGenerationControl?.checkpoint?.()||(()=>true);";
    const check="if(!generationCurrent())throw Object.assign(new Error('后续生图已取消'),{name:'AbortError',generationCancelled:true});";
    patch('async function run(opts) {','async function run(opts) {\n    const generationCurrent=opts.generationCurrent||globalThis.__zhikuGenerationControl?.checkpoint?.()||(()=>true);\n    '+check);
    patch('        const r = await N.generate(opts);','        '+check+'\n        const r = await N.generate(opts);');
    patch('noVibe = false, src }) {','noVibe = false, src, generationCurrent }) {');
    patch('backend, i2i, noVibe, src });','backend, i2i, noVibe, src, generationCurrent });');
    // 从准备参考图开始绑定本轮，避免取消时参考请求完成后又提交图片。
    for(const name of ['makeBatchImage','generateForMessage','charAction','doGenerate']) {
        const start=source.indexOf('async function '+name+'(');
        assert(start>=0,name);
        const rest=source.slice(start),next=rest.slice(1).search(/\n(?:async )?function /);
        const end=next<0?source.length:start+next+1;
        let body=source.slice(start,end);
        body=body.replace(/(async function[^\n]+\{\n)/,'$1    '+capture+'\n');
        body=body.replaceAll('E.generateFull({','E.generateFull({generationCurrent,');
        if(name==='makeBatchImage')body=body.replace('await run({','await run({generationCurrent,');
        source=source.slice(0,start)+body+source.slice(end);
    }
    patch('const image=await __mod_engine.generateFull({src:srcNote,','const image=await __mod_engine.generateFull({generationCurrent:where?.generationCurrent,src:srcNote,');
    patch('        state.running = true; state.stopped = false; state.paused = false; tick();','        '+capture+'\n        state.running = true; state.stopped = false; state.paused = false; tick();');
    patch('            while (state.paused && !state.stopped) await new Promise(r => setTimeout(r, 400));','            while (state.paused && !state.stopped && generationCurrent()) await new Promise(r => setTimeout(r, 400));\n            if(!generationCurrent()){state.stopped=true;for(const pending of state.jobs)if(pending.status===\'wait\'){pending.status=\'skip\';pending.error=\'后续生图已取消\';}break;}');
    patch('        <nav class="pc-nav"><span class="pc-nav-ind"', '        <div class="pc-generation-row"><button type="button" class="pc-pill dashed" data-generation-toggle>取消后续生图</button></div>\n        <nav class="pc-nav"><span class="pc-nav-ind"');
    patch('    cleanups.push(() => {__mod_marker.stop();__mod_nai.stopQueue();});', `    const generationControl=__mod_nai.queueControl;
    globalThis.__zhikuGenerationControl=generationControl;
    cleanups.push(()=>{if(globalThis.__zhikuGenerationControl===generationControl)delete globalThis.__zhikuGenerationControl;});
    const generationPause = createGenerationPauseControls({document:DOC,queue:generationControl});
    cleanups.push(() => generationPause.stop());
    cleanups.push(() => {__mod_marker.stop();__mod_nai.stopQueue();});`);
    return fs.readFileSync(new URL('../src/generation-pause.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\n'+source;
}
