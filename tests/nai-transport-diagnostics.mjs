// 使用正式构建模块，检查双通道只读探测、跨窗口错误、持久化选择与请求隔离。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createNaiNetwork } from '../src/nai-network.js';

const runtime = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const config = {naiMode:'key',naiKey:'synthetic-private-key',naiNetworkMode:'page'};
const calls = [], logs = [];
let failPage = true, failChild = false, pagePending;
const foreignError = vm.runInNewContext('new TypeError("Failed to fetch")');
assert.equal(foreignError instanceof TypeError, false);
const mockFetch = channel => async (url, init) => {
    calls.push({channel,url,init});
    if (channel === 'page' && pagePending) await pagePending;
    if ((channel === 'page' && failPage) || (channel === 'isolated' && failChild)) throw foreignError;
    return new Response(JSON.stringify({trainingStepsLeft:{fixedTrainingStepsLeft:12}}));
};
let frames = 0;
const doc = {location:{origin:'http://tauri.localhost'},visibilityState:'visible',defaultView:{navigator:{onLine:true,userAgent:'synthetic WebView'}},
    createElement(){frames++;return {setAttribute(){},style:{},remove(){this.isConnected=false;},contentWindow:{fetch:mockFetch('isolated')}};},
    body:{appendChild(frame){frame.isConnected=true;}}
};
const N = vm.runInNewContext(runtime.slice(runtime.indexOf('const __mod_nai ='), runtime.indexOf('const __mod_engine ='))+'\n__mod_nai',{
    __shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},
    DOC:doc,fetch:mockFetch('page'),AbortController,setTimeout,clearTimeout,
    toastr:{info(){}},__zkLog:(...args)=>logs.push(args),
});
let release;
pagePending = new Promise(resolve=>{release=resolve;});
const pending = N.probeNaiNetwork();
assert.equal(N.probeNaiNetwork(), pending, '重复点击复用正在执行的对照');
await Promise.resolve(); assert.equal(calls.length,1,'先只发送第一路');
release(); pagePending=null;
const result = await pending;
assert.equal(result.ok,false);
assert(result.text.includes('页面联网') && result.text.includes('独立 iframe 联网'));
assert(result.text.includes('未测试生图'));
assert.deepEqual(calls.map(c=>c.channel),['page','isolated']);
assert(calls.every(c=>c.url.endsWith('/user/subscription') && !c.init.body && !c.init.method));
assert.equal(config.naiNetworkMode,'page','测试不改变保存的通道');
assert.equal(logs.length,2);
assert(JSON.stringify(logs).includes('TypeError: Failed to fetch'));
assert(JSON.stringify(logs).includes('页面来源：http://tauri.localhost'));
assert(!JSON.stringify(logs).includes(config.naiKey));
failPage=false;
const tested = await N.testConnection();
assert(tested.ok && tested.text.includes('页面联网'));
assert.equal(calls.at(-1).channel,'page');
config.naiNetworkMode='isolated';
await N.testConnection(); assert.equal(calls.at(-1).channel,'isolated');

// 真正跨 realm 的错误必须进入中文说明，且不误判取消或普通类型错误。
const netError = vm.runInNewContext(runtime.slice(runtime.indexOf('function netError(e)'), runtime.indexOf('function normalizeNaiChars'))+'\nnetError',{settings:()=>config});
assert(netError(foreignError).message.includes('两种通道对照'));
for (const error of [Object.assign(Error('fetch'),{name:'AbortError'}), TypeError('invalid parameters')]) assert.equal(netError(error),error);

let mode='page';
const network=createNaiNetwork({document:doc,pageFetch:mockFetch('page'),getMode:()=>mode});
const initialFrames=frames;
const pageInfo={},init={method:'POST',headers:{Authorization:'Bearer synthetic'},body:'unchanged'};
await network.fetch('https://image.novelai.net/ai/generate-image',init,pageInfo);
assert.equal(frames,initialFrames,'页面方式不创建隐藏 iframe');
assert.equal(calls.at(-1).init,init,'正文和请求头原样传递');
mode='isolated'; const childInfo={};
await network.fetch('https://image.novelai.net/ai/generate-image',init,childInfo);
assert.equal(pageInfo.transport,'页面 fetch','后续通道不污染前次诊断');
assert.equal(childInfo.transport,'独立浏览器 fetch');
failChild=true; const before=calls.length;
await assert.rejects(network.fetch('https://image.novelai.net/ai/generate-image',init,{}));
assert.equal(calls.length-before,1,'POST 失败不得自动切换另一路重发');
const redacted=network.errorText(Error('Bearer synthetic-private-key pst-abcd-secret'),config.naiKey);
assert(!redacted.includes(config.naiKey) && !redacted.includes('pst-abcd'));
network.stop();N.stopQueue();
assert(runtime.includes('data-st="naiNetworkMode"') && runtime.includes("case 'naiprobe':"));
console.log('PASS 双通道独立诊断、只读串行探测、重复点击复用、选择保留、跨 realm 错误与凭据遮蔽');
