// 独立浏览器测试：不引用 TT、智库运行时、代理服务或第三方脚本。
export const endpoint = 'https://image.novelai.net';
export function testBody(model = 'nai-diffusion-5-full') {
    if (!['nai-diffusion-5-full','nai-diffusion-4-5-full'].includes(model)) throw Error('未知模型');
    const prompt='1girl, solo, adult woman, black hair, white shirt, sitting by a window, soft daylight, upper body, best quality';
    const negative='lowres, bad anatomy, bad hands, text, watermark';
    const parameters={params_version:(model==='nai-diffusion-5-full')?4:3,width:832,height:1216,steps:28,scale:5,seed:2811732822,n_samples:1,sampler:'k_euler_ancestral',cfg_rescale:0.1,ucPreset:3,qualityToggle:false,dynamic_thresholding:false,controlnet_strength:1,legacy:false,legacy_uc:false,add_original_image:true,legacy_v3_extend:false,negative_prompt:negative,use_coords:false,characterPrompts:[],v4_prompt:{caption:{base_caption:prompt,char_captions:[]},use_coords:false,use_order:true},v4_negative_prompt:{caption:{base_caption:negative,char_captions:[]},legacy_uc:false},autoSmea:false,inpaintImg2ImgStrength:1,normalize_reference_strength_multiple:false,stream:'msgpack',deliberate_euler_ancestral_bug:false,prefer_brownian:true};
    if((model==='nai-diffusion-5-full'))Object.assign(parameters,{tag_hint_uc_preset:0,tag_hint_qt:1,straight_alpha:false});
    else parameters.noise_schedule='karras';
    return {input:prompt,model,action:'generate',parameters,use_new_shared_trial:true};
}

export async function directRequest(kind,key,{model,fetchImpl=fetch,timeoutMs=kind==='generate'?180000:20000,signal,onStage=()=>{}}={}) {
    if(!['subscription','generate'].includes(kind))throw Error('未知测试');
    if(!key?.trim())throw Error('请填写官方 Key');
    const controller=new AbortController(),start=performance.now();
    let timedOut=false;
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
    const record={kind,model:kind==='generate'?model:undefined,at:new Date().toISOString(),stage:'等待响应头',status:null,headersMs:null,bytes:0};
    try {
        onStage(record.stage);
        const response=await fetchImpl(endpoint+(kind==='generate'?'/ai/generate-image':'/user/subscription'),{
            method:kind==='generate'?'POST':'GET',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,
            headers:{Authorization:'Bearer '+key.trim(),...(kind==='generate'?{'Content-Type':'application/json',Accept:'*/*'}:{})},
            ...(kind==='generate'?{body:JSON.stringify(testBody(model))}:{})
        });
        record.status=response.status;record.headersMs=Math.round(performance.now()-start);record.contentType=response.headers.get('content-type')||'';
        record.stage='读取响应体';onStage(record.stage);
        const buffer=new Uint8Array(await response.arrayBuffer());record.bytes=buffer.byteLength;
        // 不记录订阅详情、服务端错误正文或鉴权头，避免导出账户信息及回显凭据。
        if(!response.ok){record.outcome='http-error';record.message='服务器返回 HTTP '+response.status;}
        else if(kind==='subscription'){
            JSON.parse(new TextDecoder().decode(buffer));record.outcome='subscription-ok';record.message='订阅请求成功';
        }else{record.outcome='response-ok';record.message='生图响应已完整收到，等待检查图片';}
        record.stage='响应接收完成';
        return {record,buffer:kind==='generate'&&response.ok?buffer:null};
    }catch(error){
        record.outcome=timedOut?'timeout':controller.signal.aborted?'cancelled':record.status?'body-error':'fetch-error';
        record.message=timedOut?'请求超时':controller.signal.aborted?'已停止等待；已提交的生图可能仍会扣费':record.status?'已收到 HTTP 响应，但响应体读取或解析失败':'浏览器未取得可读响应（网络、TLS、CORS 或浏览器限制尚无法区分）';
        return {record,buffer:null};
    }finally{record.elapsedMs=Math.round(performance.now()-start);clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export async function imageBlob(bytes) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(bytes.length>=8&&view.getUint32(0)===0x89504e47)return new Blob([bytes],{type:'image/png'});
    if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216)return new Blob([bytes],{type:'image/jpeg'});
    // 读取 ZIP 中央目录，兼容带数据描述符的服务端压缩包。
    let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0)throw Error('响应不是可识别的 PNG/JPEG/ZIP，不能据此判断网络失败');
    let pos=view.getUint32(end+16,true);
    for(let n=0;n<view.getUint16(end+10,true);n++){
        if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw Error('ZIP 目录不完整');
        const method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),rawSize=view.getUint32(pos+24,true),local=view.getUint32(pos+42,true);
        const names=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
        const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+names));pos+=46+names+extra+comment;
        if(!/\.(png|jpe?g|webp)$/i.test(name))continue;
        if(rawSize>20*1024*1024||local+30>bytes.length)throw Error('图片大小或 ZIP 结构异常');
        const offset=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
        if(offset+size>bytes.length)throw Error('ZIP 图片不完整');
        let image=bytes.slice(offset,offset+size);
        if(method===8)image=new Uint8Array(await new Response(new Blob([image]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
        else if(method!==0)throw Error('浏览器不支持此 ZIP 压缩方式');
        return new Blob([image],{type:/\.webp$/i.test(name)?'image/webp':/\.jpe?g$/i.test(name)?'image/jpeg':'image/png'});
    }
    throw Error('ZIP 中未找到图片');
}
