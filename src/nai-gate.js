export function createNaiGate({ sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now(), notice = () => {}, gap = 1500 } = {}) {
    let queue = Promise.resolve(), next = 0, stopped = false;
    let wake;
    const stopping = new Promise(resolve => { wake = resolve; });
    function stop() { stopped = true; wake(); }
    function run(fn, { retryServer = true, retryNetwork = false } = {}) {
        const job = queue.then(async () => {
            for (let attempt = 0; ; attempt++) {
                if (stopped) throw new Error('生图已停止');
                const delay = next - now();
                if (delay > 0) await Promise.race([sleep(delay), stopping]);
                if (stopped) throw new Error('生图已停止');
                try { return await fn(); }
                catch (error) {
                    const network = retryNetwork && !error.status && (error.retryableNetwork || (error.name === 'TypeError' && /fetch|network|load failed/i.test(error.message || '')));
                    const server = retryServer && (error.retryable || (error.status >= 500 && error.status <= 504));
                    if (error.name === 'AbortError' || (!network && error.status !== 429 && !server) || attempt >= 2) throw error;
                    const seconds = Number(error.retryAfter), date = Date.parse(error.retryAfter);
                    const retry = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Number.isFinite(date) ? Math.max(0, date - now()) : 0;
                    next = now() + Math.max(retry, 5000 * 2 ** attempt);
                    const wait = Math.ceil((next - now()) / 1000);
                    const reason = network ? '网络连接中断或超时' : error.status === 429 ? '请求受到限流' : 'NovelAI 服务器返回 ' + error.status;
                    notice(reason + '，等待 ' + wait + ' 秒后重试（' + (attempt + 1) + '/2）');
                    globalThis.__zkLog?.('生图重试', reason + ' · 第 ' + (attempt + 1) + ' 次重试，等 ' + wait + ' 秒');
                } finally { next = Math.max(next, now() + gap); }
            }
        });
        queue = job.catch(() => {});
        return job;
    }
    return { stop, run };
}
