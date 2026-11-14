import fs from 'node:fs';
import assert from 'node:assert/strict';

export function applyNaiNetwork(source) {
    let s = source;
    const patch = (before, after) => {
        assert.equal(s.split(before).length, 2, before.slice(0, 100));
        s = s.replace(before, () => after);
    };
    const helpers = fs.readFileSync('src/nai-network.js', 'utf8').replace(/^export /gm, '');
    patch('const http = (...a) => (globalThis.__pcFetch || fetch)(...a);', helpers + `
const naiNetwork = createNaiNetwork({
    document: typeof DOC === 'undefined' ? null : DOC,
    pageFetch: (...args) => (globalThis.__pcFetch || fetch)(...args),
    getMode: () => settings().naiNetworkMode,
});
const http = (...args) => naiNetwork.fetch(...args);`);
    patch('stopQueue:()=>{siteStopped=true;__naiGate.stop();stopGpt();}', 'stopQueue:()=>{siteStopped=true;__naiGate.stop();naiNetwork.stop();stopGpt();}');
    patch('const r = await generateRequestInner(opts, body=>{try{', `const official = opts.backend !== 'comfy' && s0.naiMode === 'key';
        const send = signal => generateRequestInner(signal ? { ...opts, signal } : opts, body=>{try{`);
    patch('        }catch{}},responseInfo);', `        }catch{}},responseInfo);
        const r = official ? await naiNetwork.run(send, { signal: opts.signal }) : await send(opts.signal);`);
    patch('let naiSent=null;const responseInfo={};', 'let naiSent=null;const responseInfo={networkMode:s0.naiMode === "key" ? s0.naiNetworkMode : undefined};');
    patch('const t0 = Date.now(), s0 = settings(), logSource', 'const t0 = Date.now(), s0 = { ...settings() }, logSource');
    patch("        const b=brief();", "        responseInfo.networkError = naiNetwork.errorText(e, s0.naiMode === 'key' ? s0.naiKey : s0.naiSiteKey);\n        const b=brief();");
    patch("globalThis.__zkLog?.('生图失败',(e.message || String(e))+(e.status?' · HTTP '+e.status:''),detail);", "globalThis.__zkLog?.('生图失败',responseInfo.networkError+' · '+((Date.now()-t0)/1000).toFixed(1)+' 秒'+(e.status?' · HTTP '+e.status:''),detail);");
    const innerStart = s.indexOf('async function generateRequestInner('), innerEnd = s.indexOf('function toDataUrl(', innerStart);
    const inner = s.slice(innerStart, innerEnd);
    const oldBody = "        body: JSON.stringify(body),\n    },responseInfo);";
    assert.equal(inner.split(oldBody).length, 2);
    s = s.slice(0, innerStart) + inner.replace(oldBody, "        body: JSON.stringify(body), signal: opts.signal,\n    },responseInfo);") + s.slice(innerEnd);
    patch("    try{return {image:await imageFromResponse(buf,responseInfo),sent};}", "    responseInfo.stage = '解析图片';\n    try{return {image:await imageFromResponse(buf,responseInfo),sent};}");
    const officialTest = `        const r = await http('https://image.novelai.net/user/subscription', { headers: { Authorization: 'Bearer ' + key } });
        if (r.status === 401) return { ok: false, text: 'key 不对' };
        if (!r.ok) return { ok: false, text: \`NovelAI 返回 \${r.status}\` };
        return { ok: true, text: '能用' + anlasText(await r.json()) };`;
    patch(officialTest, `        return await queryOfficialSubscription(key, networkMode);`);
    patch('async function testConnection() {', 'async function testConnection(networkMode = settings().naiNetworkMode) {');
    patch('function anlasText(j) {', fs.readFileSync('src/nai-probe.js', 'utf8') + '\nfunction anlasText(j) {');
    patch('generate, unzipFirstImage, testConnection,', 'generate, unzipFirstImage, testConnection, probeNaiNetwork,');
    patch("naiMode: 'key', naiKey: '',", "naiMode: 'key', naiNetworkMode: 'isolated', naiKey: '',");
    patch('if (!(e instanceof TypeError) || !/fetch|network|load failed/i.test(String(e.message))) return e;', "if (e?.name !== 'TypeError' || !/fetch|network|load failed/i.test(String(e.message))) return e;");
    patch("s.naiMode === 'key' && e instanceof TypeError", "s.naiMode === 'key' && e?.name === 'TypeError'");
    patch('请检查 TT 是否已加入手机代理的应用名单，以及当前网络连接', '可能是连接中断、跨域限制或 WebView 联网失败。可到设置 → NovelAI 做两种通道对照，详见问题记录');
    patch("        if (el.dataset.st === 'naiKey' || el.dataset.st === 'naiSite') ui.naiTest = null;", "        if (['naiKey','naiSite','naiNetworkMode'].includes(el.dataset.st)) { ui.naiTest = null; if (el.dataset.st === 'naiNetworkMode') render(); }");
    patch('<div class="pc-hint">在 NovelAI 网页：左上角菜单 → Account Settings → Get Persistent API Token，复制过来。</div>', `<div class="pc-hint">在 NovelAI 网页：左上角菜单 → Account Settings → Get Persistent API Token，复制过来。</div>
      <label class="pc-field"><span>官方联网通道</span><select data-st="naiNetworkMode"><option value="isolated" \${n.naiNetworkMode !== 'page' ? 'selected' : ''}>独立 iframe 联网（原有方式）</option><option value="page" \${n.naiNetworkMode === 'page' ? 'selected' : ''}>页面联网（对照用）</option></select></label>
      <div class="pc-hint">两种方式都使用浏览器联网，不是 Rust 代理。切换后下一次请求生效；失败不会自动换通道。原有同通道有限重试仍保留。</div>
      <button class="pc-btn" data-act="naiprobe">对照测试两种通道（不生图）</button>
      <div class="pc-hint">依次查询订阅，每路最多 15 秒，不生成图片、不消耗生图点数。结果写入问题记录；测试成功不保证生图 POST 成功。</div>`);
    patch("            case 'naitest': {", `            case 'naiprobe': {
                el.disabled = true; el.textContent = '对照中…';
                try { ui.naiTest = await N.probeNaiNetwork(); }
                catch (e) { ui.naiTest = {ok:false,text:String(e?.message || e)}; }
                finally { render(); }
                break;
            }
            case 'naitest': {`);
    return s;
}
