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
});
const http = (...args) => naiNetwork.fetch(...args);`);
    patch('stopQueue:()=>{siteStopped=true;__naiGate.stop();stopGpt();}', 'stopQueue:()=>{siteStopped=true;__naiGate.stop();naiNetwork.stop();stopGpt();}');
    patch('const r = await generateRequestInner(opts, body=>{try{', `const official = opts.backend !== 'comfy' && s0.naiMode === 'key';
        const send = signal => generateRequestInner(signal ? { ...opts, signal } : opts, body=>{try{`);
    patch('        }catch{}},responseInfo);', `        }catch{}},responseInfo);
        const r = official ? await naiNetwork.run(send, { signal: opts.signal }) : await send(opts.signal);`);
    patch("        const b=brief();", "        responseInfo.transport = s0.naiMode === 'key' ? naiNetwork.kind() : '';\n        const b=brief();");
    patch("globalThis.__zkLog?.('生图失败',(e.message || String(e))+(e.status?' · HTTP '+e.status:''),detail);", "globalThis.__zkLog?.('生图失败',(e.message || String(e))+' · '+((Date.now()-t0)/1000).toFixed(1)+' 秒'+(e.status?' · HTTP '+e.status:''),detail);");
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
    patch(officialTest, `        return await naiNetwork.run(async signal => {
            const r = await http('https://image.novelai.net/user/subscription', { headers: { Authorization: 'Bearer ' + key }, signal });
            if (r.status === 401) return { ok: false, text: 'key 不对' };
            if (!r.ok) return { ok: false, text: \`NovelAI 返回 \${r.status}\` };
            return { ok: true, text: '能用' + anlasText(await r.json()) };
        }, { timeout: 15000 });`);
    return s;
}
