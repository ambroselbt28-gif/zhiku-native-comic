import assert from 'node:assert/strict';
import {directRequest,testBody,imageBlob} from '../dev/nai-standalone/core.mjs';
let calls=[];
const mock=async(url,init)=>{calls.push({url,init});return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});};
let result=await directRequest('subscription','fixture-secret',{fetchImpl:mock});
assert.equal(result.record.outcome,'subscription-ok');assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);
assert.equal(calls[0].url,'https://image.novelai.net/user/subscription');
assert.equal(calls[0].init.credentials,'omit');assert(!JSON.stringify(result.record).includes('fixture-secret'));
calls=[];result=await directRequest('generate','fixture-secret',{model:'nai-diffusion-5-full',fetchImpl:mock});
assert.equal(calls.length,1);assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].url,'https://image.novelai.net/ai/generate-image');
const body=JSON.parse(calls[0].init.body);assert.equal(body.parameters.n_samples,1);assert.equal(body.parameters.seed,2811732822);assert.equal(body.parameters.v4_prompt.caption.base_caption,body.input);
assert.equal(testBody('nai-diffusion-4-5-full').parameters.params_version,3);assert.equal(body.parameters.params_version,4);
for(const status of [401,403,429,500]){const r=await directRequest('generate','fixture-secret',{fetchImpl:async()=>new Response('fixture-secret',{status})});assert.equal(r.record.outcome,'http-error');assert.equal(r.record.status,status);assert(!JSON.stringify(r).includes('fixture-secret'));}
result=await directRequest('subscription','fixture-secret',{fetchImpl:async()=>{throw new TypeError('fixture-secret');}});assert.equal(result.record.outcome,'fetch-error');assert(!JSON.stringify(result).includes('fixture-secret'));
result=await directRequest('subscription','fixture-secret',{timeoutMs:5,fetchImpl:async(_,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('abort'))))});assert.equal(result.record.outcome,'timeout');
const controller=new AbortController();const pending=directRequest('subscription','fixture-secret',{signal:controller.signal,fetchImpl:async(_,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('abort'))))});controller.abort();assert.equal((await pending).record.outcome,'cancelled');
const png=Uint8Array.from([137,80,78,71,13,10,26,10]);assert.equal((await imageBlob(png)).type,'image/png');await assert.rejects(()=>imageBlob(new TextEncoder().encode('{}')),/不是可识别/);
// 最小 ZIP 存储条目，验证中央目录解析，不依赖插件内的 ZIP 实现。
const name=new TextEncoder().encode('image_0.png'),zip=new Uint8Array(30+name.length+png.length+46+name.length+22),dv=new DataView(zip.buffer);
dv.setUint32(0,0x04034b50,true);dv.setUint16(26,name.length,true);zip.set(name,30);zip.set(png,30+name.length);
const central=30+name.length+png.length;dv.setUint32(central,0x02014b50,true);dv.setUint32(central+20,png.length,true);dv.setUint32(central+24,png.length,true);dv.setUint16(central+28,name.length,true);zip.set(name,central+46);
const end=central+46+name.length;dv.setUint32(end,0x06054b50,true);dv.setUint16(end+10,1,true);dv.setUint32(end+16,central,true);
assert.deepEqual(new Uint8Array(await (await imageBlob(zip)).arrayBuffer()),png);
console.log('PASS 独立直连端点、单次提交、两模型、HTTP/网络/超时/取消分类、凭据不入日志、图片/ZIP解析');
