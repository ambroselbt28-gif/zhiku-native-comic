export function createNaiGate({ sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now(), notice = () => {}, gap = 1500 } = {}) {
    let queue = Promise.resolve(), next = 0, stopped = false, pending = 0, active = 0, revision = 0, cancelled = false;
    const listeners = new Set();
    const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
    let interruption=deferred();
    const cancelError=()=>Object.assign(new Error(stopped?'生图已停止':'后续生图已取消'),{name:'AbortError',generationCancelled:true});
    const checkpoint=()=>{const version=revision;return ()=>!stopped&&version===revision;};
    const snapshot = () => ({cancelled,stopped,active,queued:Math.max(0,pending-active),pending});
    const emit = () => { for(const listener of listeners){try{listener(snapshot());}catch{/* 界面异常不能中断生图队列。 */}} };
    let wake;
    const stopping = new Promise(resolve => { wake = resolve; });
    function cancelPending() { if(stopped)return;revision++;cancelled=true;const previous=interruption;interruption=deferred();previous.resolve();emit(); }
    function stop() { stopped=true;revision++;wake();interruption.resolve();emit();listeners.clear(); }
    function run(fn, { retryServer = true, retryNetwork = false } = {}) {
        const current=checkpoint(),interrupt=interruption.promise;let inRequest=false;
        cancelled=false;pending++;emit();
        const work = queue.then(async () => {
            for (let attempt = 0; ; attempt++) {
                if(!current())throw cancelError();
                const delay = next - now();
                if (delay > 0) await Promise.race([sleep(delay), stopping, interrupt]);
                // 冷却与重试开始前检查取消；当前已发出的请求允许完成。
                if(!current())throw cancelError();
                active++;inRequest=true;emit();
                try { return await fn(); }
                catch (error) {
                    if(!current())throw cancelError();
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
                } finally { active--;inRequest=false;next = Math.max(next, now() + gap);emit(); }
            }
        });
        // 未发出的任务立即退队；串行链仍等待当前请求收尾，避免新任务与它并发。
        const job=Promise.race([work,interrupt.then(()=>{if(inRequest)return work;throw cancelError();})]).finally(()=>{pending--;emit();});
        queue = work.catch(() => {});
        return job;
    }
    return { stop, run, cancelPending, checkpoint, cancelError, snapshot, subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);} };
}
