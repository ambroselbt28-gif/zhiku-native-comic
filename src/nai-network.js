// 官方请求使用独立 fetch，避免页面上的请求包装器干扰，并覆盖整个响应读取过程。
export function createNaiNetwork({ document, pageFetch, Controller = globalThis.AbortController, schedule = (...args) => setTimeout(...args), unschedule = id => clearTimeout(id) } = {}) {
    let frame = null, cleanFetch = null, stopped = false;
    const pending = new Set();
    const abortError = () => Object.assign(new Error('生图已停止'), { name: 'AbortError' });
    function officialFetch(input, init) {
        if (stopped) throw abortError();
        const official = /^https:\/\/image\.novelai\.net(?:\/|$)/i.test(String(input?.url ?? input));
        if (!official) return pageFetch(input, init);
        if (frame && !frame.isConnected) { frame = null; cleanFetch = null; }
        if (!cleanFetch && document) {
            let candidate;
            try {
                candidate = document.createElement('iframe');
                candidate.setAttribute('aria-hidden', 'true');
                candidate.tabIndex = -1;
                candidate.style.cssText = 'display:none!important';
                (document.body || document.documentElement).appendChild(candidate);
                const child = candidate.contentWindow;
                if (typeof child?.fetch !== 'function') throw Error('fetch unavailable');
                cleanFetch = child.fetch.bind(child);
                frame = candidate;
            } catch { candidate?.remove(); }
        }
        return (cleanFetch || pageFetch)(input, init);
    }
    async function run(task, { timeout = 240000, signal } = {}) {
        if (stopped || signal?.aborted) throw abortError();
        if (typeof Controller !== 'function') return task(signal);
        const controller = new Controller();
        let timedOut = false;
        const cancel = () => controller.abort(signal?.reason || abortError());
        const timer = schedule(() => { timedOut = true; controller.abort(); }, timeout);
        let onAbort;
        const interrupted = new Promise((resolve, reject) => {
            onAbort = () => reject(abortError());
            controller.signal.addEventListener('abort', onAbort, { once: true });
        });
        pending.add(controller);
        signal?.addEventListener('abort', cancel, { once: true });
        try { return await Promise.race([task(controller.signal), interrupted]); }
        catch (error) {
            if (stopped || signal?.aborted) throw abortError();
            if (timedOut) throw Object.assign(new Error(`NovelAI 请求超时（${Math.round(timeout / 1000)} 秒）`), { retryableNetwork: true, status: 0 });
            throw error;
        } finally {
            unschedule(timer);
            pending.delete(controller);
            controller.signal.removeEventListener('abort', onAbort);
            signal?.removeEventListener('abort', cancel);
        }
    }
    return {
        fetch: officialFetch, run,
        kind: () => cleanFetch ? '独立浏览器 fetch' : '页面 fetch',
        stop() {
            stopped = true;
            for (const controller of pending) controller.abort(abortError());
            frame?.remove(); frame = null; cleanFetch = null;
        },
    };
}
