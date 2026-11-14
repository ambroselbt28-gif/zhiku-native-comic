// 验证发布代码的官方连接测试域名、鉴权、状态码与网络异常提示。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const runtime = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
assert(runtime.includes('未收到可读取的响应'));
assert(!runtime.includes('请求没发出去'));
const start = runtime.indexOf('const __mod_nai =');
const end = runtime.indexOf('const __mod_engine =', start);
assert(start >= 0 && end > start);
const config = { naiMode: 'key', naiKey: 'synthetic-key', naiSite: '' };
const calls = [];
let response = new Response(JSON.stringify({ trainingStepsLeft: { fixedTrainingStepsLeft: 100, purchasedTrainingSteps: 20 } }));
const nai = vm.runInNewContext(runtime.slice(start, end) + '\n__mod_nai', {
    __shim: { extension_settings: { piaoce_nai: config }, getRequestHeaders: () => ({}), saveSettingsDebounced() {} },
    TypeError,
    toastr: { info() {} },
    fetch: async (url, options) => {
        calls.push({ url, options });
        if (response instanceof Error) throw response;
        return response;
    },
});

let result = await nai.testConnection();
assert.equal(result.ok, true);
assert(result.text.includes('120'));
assert.equal(calls[0].url, 'https://image.novelai.net/user/subscription');
assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-key');
assert.equal(calls[0].options.body, undefined, '连接测试只读订阅信息');
for (const status of [401, 403, 429, 500]) {
    response = new Response('{}', { status });
    result = await nai.testConnection();
    assert.equal(result.ok, false);
    assert(result.text.includes(status === 401 ? 'key' : String(status)));
}
response = new TypeError('Failed to fetch');
result = await nai.testConnection();
assert.equal(result.ok, false, '网络失败应明确标为未验证');
assert(result.text.includes('image.novelai.net'));
assert(!result.text.includes('api.novelai.net'));
assert(!result.text.includes('synthetic-key'));
assert(result.text.includes('尚待验证'));
config.naiMode = 'site';
const before = calls.length;
result = await nai.testConnection();
assert.equal(result.ok, false);
config.naiSite = 'https://synthetic.invalid';
result = await nai.testConnection();
assert.equal(result.ok, true);
assert(result.text.includes('直接去生图页试一张'));
assert.equal(calls.length, before, '第三方通道继续使用原有测试流程');
console.log('PASS 官方订阅新域名、鉴权、余额、HTTP 错误、网络异常与第三方兼容');
