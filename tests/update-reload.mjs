import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createUpdateReloader, createReloadActivity } from '../src/update-reload.js';

const defer = () => { let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;}); return {promise,resolve,reject}; };
const drain = async () => { for(let i=0;i<35;i++) await Promise.resolve(); };
function fixture() {
    const tasks = new Map(), events = []; let nextId = 0, can = true, busy = false, number = 0, failLoad = false, failStart = false;
    const loader = createUpdateReloader({
        schedule: fn => { tasks.set(++nextId,fn); return nextId; }, cancel:id=>tasks.delete(id),
        canReload:()=>can, notify:(...args)=>events.push(args),
        async load() {
            if(failLoad)throw new Error('offline');
            const n=++number, bad=failStart;
            return {runtimeVersion:String(n),createRuntime:()=>({
                canReload:()=>!busy,
                async start(){events.push(['start',n]);if(bad)throw new Error('bad runtime');},
                async stop(){events.push(['stop',n]);},
            })};
        },
    });
    return {loader,events,tasks,setCan:v=>can=v,setBusy:v=>busy=v,setLoadFail:v=>failLoad=v,setStartFail:v=>failStart=v,
        async tick(){const work=[...tasks.values()];tasks.clear();work.forEach(fn=>fn());await drain();}};
}
{
    const f=fixture(); await Promise.all([f.loader.start(), f.loader.start()]);
    assert.deepEqual(f.events,[['start',1]],'并发启动只创建一个实例');
    f.loader.request(); f.loader.request(); assert.equal(f.tasks.size,1);
    f.setBusy(true);await f.tick();assert.equal(f.events.filter(x=>x[0]==='stop').length,0);
    f.setBusy(false);f.setCan(false);await f.tick();assert.equal(f.events.filter(x=>x[0]==='stop').length,0);
    f.setCan(true);await f.tick();
    assert.deepEqual(f.events.filter(x=>['start','stop'].includes(x[0])),[['start',1],['stop',1],['start',2]]);
    assert.equal(f.tasks.size,0,'完成后不轮询');
    await f.loader.stop();
}
{
    const f=fixture();await f.loader.start();f.setLoadFail(true);f.loader.request();await f.tick();
    assert.equal(f.events.filter(x=>x[0]==='stop').length,0,'导入失败保留旧运行时');
    f.setLoadFail(false);f.setStartFail(true);f.loader.request();await f.tick();
    assert.deepEqual(f.events.filter(x=>['start','stop'].includes(x[0])),[['start',1],['stop',1],['start',2],['stop',2],['start',1]],'启动失败清理后恢复旧版');
    f.setStartFail(false);f.loader.request();await f.tick();assert.ok(f.events.some(x=>x[0]==='success'));
    await f.loader.stop();
}
{
    const f=fixture();await f.loader.start();f.loader.request();await f.loader.stop();await f.tick();
    assert.deepEqual(f.events.filter(x=>x[0]==='start'),[['start',1]],'停用取消待重载');
    f.loader.enable();await f.loader.start();assert.equal(f.events.filter(x=>x[0]==='start').length,2);
    await f.loader.stop({permanent:true});f.loader.enable();f.loader.request();await f.loader.start();assert.equal(f.tasks.size,0);
}
{
    const delayed=defer(),events=[],tasks=[];let loads=0,can=true;
    const module={createRuntime:()=>({start:async()=>events.push('start'),stop:async()=>events.push('stop')})};
    const f=createUpdateReloader({load:()=>++loads===1?module:delayed.promise,canReload:()=>can,schedule:fn=>{tasks.push(fn);return tasks.length;},cancel:()=>{}});
    await f.start();f.request();tasks.shift()();await drain();can=false;delayed.resolve(module);await drain();
    assert.deepEqual(events,['start'],'导入新代码期间开始编辑时取消切换');
    can=true;tasks.shift()();await drain();assert.deepEqual(events,['start','stop','start']);await f.stop();
}
{
    const delayed=defer(),events=[],tasks=[];let loads=0;
    const module={createRuntime:()=>({start:async()=>events.push('start'),stop:async()=>events.push('stop')})};
    const f=createUpdateReloader({load:()=>++loads===1?module:delayed.promise,schedule:fn=>{tasks.push(fn);return tasks.length;},cancel:()=>{}});
    await f.start();f.request();tasks.shift()();await drain();const stop=f.stop();delayed.resolve(module);await stop;
    assert.deepEqual(events,['start','stop'],'导入期间停用不会重新启动');
}
{
    let clock=0;const activity=createReloadActivity({now:()=>clock});const a=defer(),b=defer();
    const obj=activity.wrap({value:3,sync(){return this.value;},run:()=>a.promise,fail:()=>b.promise});
    clock=3000;assert.ok(activity.idle());assert.equal(obj.sync(),3);assert.equal(obj.run(),a.promise);obj.fail();
    clock=10000;assert.equal(activity.idle(),false);a.resolve();await drain();assert.equal(activity.idle(),false);
    b.reject(new Error('cancelled'));await drain();assert.equal(activity.idle(),false);clock+=3000;assert.ok(activity.idle());
}
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
assert.equal(manifest.hooks.update,'onUpdate');
const entry=fs.readFileSync('index.js','utf8'),runtime=fs.readFileSync('runtime.js','utf8');
assert.ok(entry.includes('export function onUpdate()'));
assert.ok(entry.includes('runtime.js?zhiku_reload='));
assert.ok(!entry.includes('location.reload('));
assert.ok(runtime.includes("data-zhiku=\"reload\""));
assert.ok(runtime.includes('.pc-comic-book'));
for(const name of ['createAutoCharacterProfiles','createIllustrationPlanner','createComicController','createImageBackfill']) assert.ok(runtime.includes(`${name} = __zhikuWrapFactory(${name})`));
assert.ok(runtime.includes("export const runtimeVersion = '"+manifest.version+"'"));
console.log('自动重载：串行启动、任务与编辑等待、重复更新、导入失败、启动恢复、停用竞态、Promise 跟踪及发布入口通过');
