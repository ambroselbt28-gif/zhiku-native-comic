// 对照仅查询订阅；不改变已保存的通道，不提交任何生图请求。
async function queryOfficialSubscription(key, networkMode) {
    const started = Date.now();
    const info = { networkMode, url: 'https://image.novelai.net/user/subscription', stage: '等待服务器响应' };
    let result;
    try {
        result = await naiNetwork.run(async signal => {
            const response = await http(info.url, { headers: { Authorization: 'Bearer ' + key }, signal }, info);
            info.stage = '读取订阅响应';
            if (response.status === 401) { await response.body?.cancel?.(); return { ok:false, text:'key 不对' }; }
            if (!response.ok) { await response.body?.cancel?.(); return { ok:false, text:'NovelAI 返回 ' + response.status }; }
            const subscription = await response.json();
            info.stage = '订阅查询完成';
            return { ok:true, text:'能用' + anlasText(subscription) };
        }, { timeout:15000 });
    } catch (error) {
        info.networkError = naiNetwork.errorText(error, key);
        result = { ok:false, text:'连接测试失败：image.novelai.net 的订阅查询未完成（' + info.networkError + '）。Key 和生图状态尚待验证' };
    }
    info.elapsedMs = Date.now() - started;
    const channel = info.networkMode === 'page' ? '页面联网' : '独立 iframe 联网';
    const detail = siteResponseText(info) + ' · 总耗时 ' + info.elapsedMs + 'ms';
    globalThis.__zkLog?.('NAI 通道测试', channel + ' · ' + (result.ok ? '成功' : '失败'), detail);
    return { ...result, text:channel + '：' + result.text + '（' + (info.elapsedMs / 1000).toFixed(1) + ' 秒）' };
}
let naiProbePromise = null;
function probeNaiNetwork() {
    if (naiProbePromise) return naiProbePromise;
    if (settings().naiMode !== 'key') return Promise.resolve({ok:false,text:'请先选择填我的 NovelAI Key'});
    const key = authKey();
    if (!key) return Promise.resolve({ok:false,text:'请先填写 NovelAI Key'});
    naiProbePromise = (async () => {
        const results = [];
        for (const mode of ['page', 'isolated']) results.push(await queryOfficialSubscription(key, mode));
        return {ok:results.every(item=>item.ok),text:results.map(item=>item.text).join('；') + '。仅验证订阅查询，未测试生图。'};
    })().finally(() => { naiProbePromise = null; });
    return naiProbePromise;
}
