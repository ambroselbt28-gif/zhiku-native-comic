import {directRequest,imageBlob} from './core.mjs';
const $=id=>document.getElementById(id),records=[];
let active=null,imageUrl=null;
const environment={userAgent:navigator.userAgent,origin:location.origin,language:navigator.language};
const summary=()=>({test:'NAI 独立浏览器直连 v1',environment,records});
const render=()=>{$('results').textContent=JSON.stringify(summary(),null,2);};
render();
async function run(kind){
    if(active)return;
    const key=$('key').value.trim();if(!key){$('status').textContent='请先填写官方 Key';return;}
    if(kind==='generate'&&!$('consent').checked){$('status').textContent='请先勾选生图额度说明';return;}
    const controller=new AbortController();active=controller;
    for(const id of ['connect','generate','model','report','download'])$(id).disabled=true;
    $('stop').hidden=false;
    try{
        const {record,buffer}=await directRequest(kind,key,{model:$('model').value,signal:controller.signal,onStage:s=>{$('status').textContent=s+'…';}});
        record.visibility=document.visibilityState;record.online=navigator.onLine;
        if(buffer){
            $('status').textContent='已收到响应，检查图片…';
            try{
                const blob=await imageBlob(buffer);if(imageUrl)URL.revokeObjectURL(imageUrl);
                imageUrl=URL.createObjectURL(blob);$('image').src=imageUrl;
                await $('image').decode();$('image').hidden=false;
                record.outcome='image-ok';record.message='生图成功，图片已显示';
            }catch{record.outcome='image-parse-error';record.message='已收到完整生图响应，但浏览器未能显示图片；不是连接失败';}
        }
        records.push(record);$('status').textContent=record.message+' · '+(record.elapsedMs/1000).toFixed(1)+' 秒';render();
    }finally{active=null;$('stop').hidden=true;for(const id of ['connect','generate','model','report','download'])$(id).disabled=false;}
}
$('connect').onclick=()=>run('subscription');$('generate').onclick=()=>run('generate');$('stop').onclick=()=>active?.abort();
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(summary(),null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='NAI独立测试_'+Date.now()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('report').onclick=async()=>{if(!records.length){$('status').textContent='还没有测试记录';return;}$('report').disabled=true;try{const response=await fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(summary())});$('status').textContent=response.ok?'记录已发给电脑':'发送失败，请改用下载记录';}catch{$('status').textContent='无法连接电脑，请下载记录';}finally{$('report').disabled=false;}};
