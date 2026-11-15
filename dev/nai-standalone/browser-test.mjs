// 用合成 NAI 响应检查独立页面，绝不提交付费生图请求。
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url)),scratch=fileURLToPath(new URL('../../.tmp/nai-browser/',import.meta.url));
await fs.mkdir(scratch,{recursive:true});
const fixture=`<script type="module">
const checks=[];const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);};
const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('页面测试超时');};
const calls=[],reports=[];let fail=false;
globalThis.fetch=async(url,init)=>{
 if(url==='/report'){reports.push(JSON.parse(init.body));return new Response('ok');}
 if(!String(url).startsWith('https://image.novelai.net/'))throw Error('意外地址');
 calls.push({url,init});if(fail)throw new TypeError('fixture-key');
 if(String(url).endsWith('/user/subscription'))return new Response('{}');
 const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0uoAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
 return new Response(png,{headers:{'Content-Type':'image/png'}});
};
const $=id=>document.getElementById(id),report=document.createElement('pre');report.id='selftest';document.body.append(report);
try{
 await import('/app.mjs');
 check('加载页面不请求 NAI',calls.length===0);
 $('connect').click();check('空 Key 不发送',calls.length===0);
 $('key').value='fixture-key';$('generate').click();check('未同意额度不生图',calls.length===0);
 $('connect').click();await wait(() => !$('connect').disabled);
 check('连接测试只发送 GET',calls.length===1&&calls[0].init.method==='GET');
 $('consent').checked=true;$('generate').click();$('generate').click();await wait(() => !$('generate').disabled);
 check('连续点击只提交一次生图',calls.length===2&&calls[1].init.method==='POST');
 check('PNG 在真实浏览器显示成功',!$('image').hidden&&$('image').naturalWidth===1&&$('results').textContent.includes('image-ok'));
 fail=true;$('connect').click();await wait(() => !$('connect').disabled);
 check('网络错误与成功记录分开',JSON.parse($('results').textContent).records.at(-1).outcome==='fetch-error');
 $('report').click();await wait(() => !$('report').disabled);
 check('报告无 Key 且保留三次结果',reports.length===1&&reports[0].records.length===3&&!JSON.stringify(reports).includes('fixture-key'));
 check('手机宽度无页面横向溢出',document.documentElement.scrollWidth<=innerWidth);
 report.textContent=JSON.stringify({passed:checks.length});
}catch(error){report.textContent=JSON.stringify({error:error.message,checks});}
</script>`;
const html=(await fs.readFile(path.join(root,'index.html'),'utf8')).replace('<script type="module" src="/app.mjs"></script>',fixture);
const server=http.createServer(async(req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}else if(['/core.mjs','/app.mjs'].includes(req.url)){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(root,req.url.slice(1))));}else res.writeHead(404).end();});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 for(const width of [390,1366]){
    const {stdout}=await promisify(execFile)('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-gpu','--disable-crash-reporter','--disable-crashpad','--user-data-dir='+path.join(scratch,String(width)),`--window-size=${width},900`,'--virtual-time-budget=10000','--dump-dom',`http://127.0.0.1:${server.address().port}/`],{env:{...process.env,TEMP:scratch,TMP:scratch},timeout:30000,maxBuffer:1024*1024});
    const text=stdout.match(/<pre id="selftest">([^<]*)<\/pre>/)?.[1]||'{}',report=JSON.parse(text.replaceAll('&quot;','"').replaceAll('&amp;','&'));
    if(report.passed!==9)throw Error(JSON.stringify(report));console.log('PASS '+width+'px · 独立浏览器 9 项测试');
 }
}finally{await new Promise(r=>server.close(r));}
