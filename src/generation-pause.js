// 面板和悬浮入口控制同一个队列；取消后续排队，不中断已经发出的请求。
export function createGenerationPauseControls({document:doc,queue}) {
    const style=doc.createElement('style');
    style.textContent=`.zk-generation-pause{position:fixed;left:12px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:2147481000;max-width:calc(100vw - 24px);display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:#f4efe4;color:#392a22;border:1px solid #8b7b6e;box-shadow:0 3px 14px #0003;font:14px/1.4 system-ui,sans-serif}.zk-generation-pause[hidden]{display:none!important}.zk-generation-pause button{flex-shrink:0;min-height:42px;border:0;border-radius:9px;padding:8px 12px;background:#392a22;color:#fff;font:inherit;cursor:pointer}.zk-generation-pause span{min-width:0;overflow-wrap:anywhere}.pc-generation-row{display:flex;justify-content:flex-end;padding:6px 4px}`;
    const bar=doc.createElement('div');bar.className='zk-generation-pause';bar.hidden=true;
    const label=doc.createElement('span'),button=doc.createElement('button');button.type='button';button.dataset.generationToggle='';
    label.setAttribute('role','status');bar.append(label,button);doc.head.append(style);doc.body.append(bar);
    function render(state) {
        bar.hidden=state.stopped||!state.pending;
        label.textContent=state.cancelled?(state.active?'后续已取消 · 当前请求完成后结束':'后续队列已取消'):(state.active?'正在生图':'准备生图');
        if(state.queued)label.textContent+=' · 等待 '+state.queued+' 项';
        for(const control of doc.querySelectorAll('[data-generation-toggle]')){
            control.textContent='取消后续生图';
            control.removeAttribute('aria-pressed');
            control.title='取消本轮未发出的生图和重试，当前请求完成后结束；之后可重新发起生成';
        }
    }
    function click(event) {
        if(!event.target.closest?.('[data-generation-toggle]'))return;
        event.preventDefault();event.stopPropagation();
        queue.cancelPending();
    }
    doc.addEventListener('click',click,true);const unsubscribe=queue.subscribe(render);
    return {refresh:()=>render(queue.snapshot()),stop(){unsubscribe();doc.removeEventListener('click',click,true);bar.remove();style.remove();}};
}
