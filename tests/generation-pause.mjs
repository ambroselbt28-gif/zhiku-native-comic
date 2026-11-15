import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createNaiGate} from '../src/nai-gate.js';
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const begin=runtime.indexOf('function createNaiGate('),end=runtime.indexOf('const __naiGate=',begin);
const generated=vm.runInNewContext(runtime.slice(begin,end)+'\ncreateNaiGate',{setTimeout,Date});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
for(const [label,factory] of [['源码',createNaiGate],['发布代码',generated]]){
    const gate=factory({gap:0}),calls=[];
    const a=gate.run(()=>calls.push('a')),b=gate.run(()=>calls.push('b'));
    const cancelled=Promise.allSettled([a,b]);gate.cancelPending();
    assert((await cancelled).every(x=>x.status==='rejected'&&x.reason.generationCancelled));assert.equal(calls.length,0);
    const hold=deferred(),current=gate.run(async()=>{calls.push('current');await hold.promise;return 'complete';});
    await tick();const old=gate.checkpoint();
    const next=gate.run(()=>calls.push('discarded'));const rejected=assert.rejects(next,e=>e.generationCancelled);
    gate.cancelPending();await rejected;assert(!old());assert.equal(gate.snapshot().active,1);
    const fresh=gate.run(()=>{calls.push('new');return 'new';});await tick();assert.deepEqual(calls,['current']);
    hold.resolve();assert.equal(await current,'complete');assert.equal(await fresh,'new');assert.deepEqual(calls,['current','new']);
    assert.equal(gate.snapshot().pending,0);
    let time=0,tries=0;const retryWait=deferred();
    const retry=factory({gap:0,now:()=>time,sleep:async ms=>{await retryWait.promise;time+=ms;}});
    const job=retry.run(async()=>{tries++;throw Object.assign(Error('限流'),{status:429});});
    const retryRejected=assert.rejects(job,e=>e.generationCancelled);await tick();retry.cancelPending();await retryRejected;
    retryWait.resolve();await tick();assert.equal(tries,1);retry.stop();
    const failHold=deferred(),failed=gate.run(async()=>{await failHold.promise;throw Object.assign(Error('服务器失败'),{status:503});});
    const failedCheck=assert.rejects(failed,e=>e.generationCancelled);await tick();gate.cancelPending();failHold.resolve();await failedCheck;
    gate.stop();await assert.rejects(gate.run(()=>calls.push('stopped')),e=>e.generationCancelled);
    console.log('PASS '+label+' 清空未发队列、保留当前结果、立即退队、取消重试、新任务可用');
}
assert(runtime.includes('queueControl:__naiGate'));
assert(runtime.includes('createGenerationPauseControls({document:DOC,queue:generationControl})'));
assert(runtime.includes('data-generation-toggle>取消后续生图'));
console.log('PASS 全局队列与正式控制入口接线');

// 使用正式批量调度器验证当前成功、剩余跳过，重复运行不会复活被取消项。
{
    const gate=createNaiGate({gap:0}),hold=deferred(),calls=[];
    const a=runtime.indexOf('function createBatch(jobs,'),b=runtime.indexOf('// ───────────── 聊天',a);
    const createBatch=vm.runInNewContext(runtime.slice(a,b)+'\ncreateBatch',{
        getData:()=>({options:{}}),setTimeout,__zhikuGenerationControl:gate,
        makeBatchImage:async job=>{calls.push(job.id);await hold.promise;return {image:'saved'};}
    });
    const batch=createBatch([{id:1},{id:2},{id:3}]);const task=batch.run();
    gate.cancelPending();hold.resolve();await task;
    assert.deepEqual(calls,[1]);assert.equal(batch.jobs[0].status,'done');assert.equal(batch.jobs[1].status,'skip');assert.equal(batch.jobs[2].status,'skip');
    await batch.run();assert.deepEqual(calls,[1]);gate.stop();
    console.log('PASS 正式批量调度取消后不复活未执行项目');
}
