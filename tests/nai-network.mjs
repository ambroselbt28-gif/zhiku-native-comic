// 验证被包装的页面 fetch、独立联网、整个响应超时与有界重试。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createNaiNetwork } from '../src/nai-network.js';
import { createNaiGate } from '../src/nai-gate.js';

const runtime = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const start = runtime.indexOf('function createNaiNetwork('), end = runtime.indexOf('const naiNetwork =', start);
const generated = vm.runInNewContext(runtime.slice(start, end) + '\ncreateNaiNetwork', { AbortController, setTimeout, clearTimeout });
for (const factory of [createNaiNetwork, generated]) {
    const frames = [], calls = [], timers = new Map();
    let timerId = 0;
    const document = {
        createElement() {
            const frame = { style: {}, setAttribute() {}, remove() { this.isConnected = false; }, contentWindow: {
                fetch: async (url, options) => { calls.push(['clean', url, options]); return new Response('{}'); },
            } };
            frames.push(frame); return frame;
        },
        body: { appendChild(frame) { frame.isConnected = true; } },
    };
    const network = factory({ document, pageFetch: async (url, options) => { calls.push(['page', url, options]); throw TypeError('Failed to fetch'); },
        schedule: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; }, unschedule: id => timers.delete(id),
    });
    await network.fetch('https://image.novelai.net/user/subscription', { headers: { Authorization: 'Bearer synthetic' } });
    assert.equal(calls[0][0], 'clean', '页面包装器失败时使用独立浏览器 fetch');
    assert.equal(calls[0][2].headers.Authorization, 'Bearer synthetic');
    for (const url of ['/api/test', 'https://site.invalid/ai/generate-image', 'https://image.novelai.net.evil.invalid/ai/generate-image']) {
        await assert.rejects(() => network.fetch(url), /Failed to fetch/);
        assert.equal(calls.at(-1)[0], 'page', '同源和其他域名继续原联网通道');
    }
    frames[0].remove();
    await network.fetch('https://image.novelai.net/ai/generate-image');
    assert.equal(frames.length, 2, '移除的独立通道会重建');
    await network.run(async signal => { assert(signal); return 'done'; });
    assert.equal(timers.size, 0);
    let heldSignal;
    const hung = network.run(signal => { heldSignal = signal; return new Promise(() => {}); });
    const failed = assert.rejects(hung, error => error.retryableNetwork && error.message.includes('240'));
    assert.equal([...timers.values()][0].delay, 240000);
    [...timers.values()][0].fn();
    await failed;
    assert.equal(heldSignal.aborted, true);
    assert.equal(timers.size, 0, '超时后清除计时器');
    const outer = new AbortController();
    const cancelled = network.run(() => new Promise(() => {}), { signal: outer.signal, timeout: 15000 });
    const cancellation = assert.rejects(cancelled, error => error.name === 'AbortError' && !error.retryableNetwork);
    outer.abort(TypeError('network failed'));
    await cancellation;
    const stopped = network.run(() => new Promise(() => {}));
    const stopping = assert.rejects(stopped, error => error.name === 'AbortError');
    network.stop(); await stopping;
    assert(frames.every(frame => !frame.isConnected));
    await assert.rejects(() => network.run(async () => 'late'), /已停止/);
}

let time = 0, attempts = 0;
const waits = [];
const gate = createNaiGate({ now: () => time, sleep: async ms => { waits.push(ms); time += ms; } });
const request = () => { attempts++; throw TypeError('Failed to fetch'); };
await assert.rejects(gate.run(request, { retryNetwork: true }));
assert.equal(attempts, 3);
assert.deepEqual(waits, [5000, 10000]);
attempts = 0;
await assert.rejects(gate.run(request)); assert.equal(attempts, 1);
for (const error of [Object.assign(Error('cancel'), { name: 'AbortError' }), TypeError('invalid parameters'), Object.assign(Error('invalid key'), { status: 401 })]) {
    attempts = 0;
    await assert.rejects(gate.run(() => { attempts++; throw error; }, { retryNetwork: true }));
    assert.equal(attempts, 1);
}
gate.stop();
console.log('PASS 源码与发布独立联网、域名隔离、超时、取消、停用清理、有界网络重试');
