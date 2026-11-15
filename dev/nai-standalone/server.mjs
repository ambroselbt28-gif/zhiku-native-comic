import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=fileURLToPath(new URL('.',import.meta.url));
const output=fileURLToPath(new URL('../../.tmp/nai-standalone/',import.meta.url));
const arg=(name,fallback)=>{const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1];};
const host=arg('--host','127.0.0.1'),port=Number(arg('--port','8766'));
const files={'/':['index.html','text/html; charset=utf-8'],'/app.mjs':['app.mjs','text/javascript; charset=utf-8'],'/core.mjs':['core.mjs','text/javascript; charset=utf-8']};
const short=(v,max=300)=>typeof v==='string'?v.slice(0,max):'';
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
// 服务端只收白名单诊断字段，不接收 Key、请求头、图片或原始响应。
function sanitize(body){
    return {test:'NAI 独立浏览器直连 v1',receivedAt:new Date().toISOString(),environment:{userAgent:short(body.environment?.userAgent,500),origin:short(body.environment?.origin),language:short(body.environment?.language,40)},records:(Array.isArray(body.records)?body.records:[]).slice(-30).map(r=>({kind:short(r.kind,30),model:short(r.model,60),at:short(r.at,40),stage:short(r.stage,80),status:number(r.status),headersMs:number(r.headersMs),elapsedMs:number(r.elapsedMs),bytes:number(r.bytes),contentType:short(r.contentType,80),outcome:short(r.outcome,40),message:short(r.message),visibility:short(r.visibility,20),online:r.online===true}))};
}
const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self' https://image.novelai.net; object-src 'none'; frame-ancestors 'none'; form-action 'none'");
    try{
        if(req.method==='GET'&&files[req.url]){const [file,type]=files[req.url];res.setHeader('Content-Type',type);res.end(await fs.readFile(path.join(base,file)));if(req.url==='/')console.log('测试页已打开：'+req.socket.remoteAddress);return;}
        if(req.method==='POST'&&req.url==='/report'){
            if(req.headers.origin!==`http://${req.headers.host}`||!String(req.headers['content-type']).startsWith('application/json')){res.writeHead(403).end();return;}
            let text='';for await(const chunk of req){text+=chunk.toString();if(text.length>60000){res.writeHead(413).end();return;}}
            const report=sanitize(JSON.parse(text));await fs.mkdir(output,{recursive:true});
            const filename='report-'+Date.now()+'.json';await fs.writeFile(path.join(output,filename),JSON.stringify(report,null,2));
            console.log('收到测试记录：'+filename+' · '+report.records.map(r=>r.kind+':'+r.outcome+' HTTP '+r.status).join(' / '));res.writeHead(200).end('ok');return;
        }
        res.writeHead(404).end('Not found');
    }catch{res.writeHead(400).end('Invalid request');}
});
server.requestTimeout=15000;
server.listen(port,host,()=>console.log(`NAI 独立测试页：http://${host}:${port}/\n此服务只提供静态页面并接收用户主动发送的诊断记录，不代理 NAI。`));
