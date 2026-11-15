import fs from 'node:fs';
import assert from 'node:assert/strict';
export function applyGenerationPause(source) {
    const patch=(from,to)=>{assert.equal(source.split(from).length,2,'暂停生图入口：'+from.slice(0,70));source=source.replace(from,()=>to);};
    patch('stopQueue:()=>{siteStopped=true;', 'queueControl:__naiGate, stopQueue:()=>{siteStopped=true;');
    patch('        <nav class="pc-nav"><span class="pc-nav-ind"', '        <div class="pc-generation-row"><button type="button" class="pc-pill dashed" data-generation-toggle>${N.queueControl.snapshot().paused ? \'继续生图\' : \'暂停生图\'}</button></div>\n        <nav class="pc-nav"><span class="pc-nav-ind"');
    patch('    cleanups.push(() => {__mod_marker.stop();__mod_nai.stopQueue();});', `    const generationPause = createGenerationPauseControls({document:DOC,queue:__mod_nai.queueControl});
    cleanups.push(() => generationPause.stop());
    cleanups.push(() => {__mod_marker.stop();__mod_nai.stopQueue();});`);
    return fs.readFileSync(new URL('../src/generation-pause.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\n'+source;
}
