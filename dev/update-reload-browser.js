// 使用正式入口与真实 ES 模块缓存，运行时替换为不联网的合成对象。
export async function testUpdateReload(check) {
    const events = new Map(), previous = globalThis.SillyTavern;
    const state = globalThis.__reloadTest = { starts: [], stops: [], busy: false };
    const context = { extensionSettings: {}, getRequestHeaders(){return {};}, saveSettingsDebounced(){},
        eventTypes: {APP_READY:'ready',GENERATION_STARTED:'generating',GENERATION_ENDED:'ended'},
        eventSource:{on(e,fn){if(!events.has(e))events.set(e,new Set());events.get(e).add(fn);},removeListener(e,fn){events.get(e)?.delete(fn);}},
    };
    globalThis.SillyTavern={getContext:()=>context};
    const fire=e=>{for(const fn of events.get(e)||[])fn();};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const entry=await import('./reload-entry.js');
    fire('ready');await wait(100);
    check('正式入口首次只启动一个运行时',state.starts.length===1);
    const draft=document.createElement('textarea');draft.value='聊天输入草稿';document.body.append(draft);
    const panel=document.createElement('div');panel.id='pc-root';panel.className='open';document.body.append(panel);
    entry.onUpdate();entry.onUpdate();await wait(1100);
    check('更新等待正在编辑的智库面板',state.starts.length===1&&state.stops.length===0);
    panel.remove();state.busy=true;await wait(1100);
    check('更新等待生成任务结束',state.starts.length===1);
    state.busy=false;fire('generating');await wait(1100);
    check('更新等待酒馆正文生成结束',state.starts.length===1);
    fire('ended');await wait(1100);
    check('更新通过新模块地址切换且旧实例只停一次',state.starts.length===2&&state.stops.length===1&&state.starts[0]!==state.starts[1]);
    check('自动重载保留宿主聊天草稿',draft.value==='聊天输入草稿'&&draft.isConnected);
    entry.onUpdate();await entry.onDisable();await wait(1100);
    check('停用取消等待中的更新',state.starts.length===2&&state.stops.length===2);
    entry.onEnable();await wait(100);
    check('重新启用正常启动且不会重复挂宿主事件',state.starts.length===3&&events.get('ready').size===1);
    await entry.onDelete();
    check('删除清理更新入口和宿主事件',!globalThis.__zhikuRequestReload&&[...events.values()].every(set=>!set.size));
    draft.remove();globalThis.SillyTavern=previous;delete globalThis.__reloadTest;
}
