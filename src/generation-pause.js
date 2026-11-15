// 面板和悬浮入口控制同一个队列（历史模块定位标记）；现仅保留面板按钮，不创建遮挡正文的悬浮条。
export function createGenerationPauseControls({document:doc,queue}) {
    const style=doc.createElement('style');
    style.textContent=`.pc-generation-row{display:flex;justify-content:flex-end;padding:6px 4px}`;
    doc.head.append(style);
    function render() {
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
    return {refresh:()=>render(queue.snapshot()),stop(){unsubscribe();doc.removeEventListener('click',click,true);style.remove();}};
}
