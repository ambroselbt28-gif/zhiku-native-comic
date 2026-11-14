// 官方两种通道均为浏览器联网；单次请求只选一路，不在失败后暗中切换重发。
export function createNaiNetwork({ document, pageFetch, getMode = () => 'isolated', Controller = globalThis.AbortController, schedule = (...args) => setTimeout(...args), unschedule = id => clearTimeout(id) } = {}) {
    let frame = null, cleanFetch = null, stopped = false;
    let lastKind = '页面 fetch';
    const pending = new Set();
    const abortError = () => Object.assign(new Error('生图已停止'), { name: 'AbortError' });
    async function officialFetch(input, init, info = {}) {
        if (stopped) throw abortError();
        const official = /^https:\/\/image\.novelai\.net(?:\/|$)/i.test(String(input?.url ?? input));
        if (!official) return pageFetch(input, init);
        const mode = (info.networkMode ?? getMode()) === 'page' ? 'page' : 'isolated';
        info.networkMode = mode;
        info.origin = document?.location?.origin || '未知';
        info.visibility = document?.visibilityState || '未知';
        const nav = document?.defaultView?.navigator;
        info.online = typeof nav?.onLine === 'boolean' ? nav.onLine : '未知';
        info.webview = String(nav?.userAgent || '').slice(0,300);
        if (frame && !frame.isConnected) { frame = null; cleanFetch = null; }
        if (mode === 'isolated' && !cleanFetch && document) {
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
        const send = mode === 'page' ? pageFetch : (cleanFetch || pageFetch);
        info.transport = lastKind = mode === 'page' ? '页面 fetch' : cleanFetch ? '独立浏览器 fetch' : '页面 fetch（独立通道创建失败）';
        const started = Date.now();
        try {
            const response = await send(input, init);
            info.headersMs = Date.now() - started;
            info.status = response.status;
            return response;
        } catch (error) {
            info.headersMs = Date.now() - started;
            throw error;
        }
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
        kind: () => lastKind,
        errorText(error, key = '') {
            // 不记录 headers/body/stack；服务错误中意外回显的凭据也必须遮蔽。
            let text = String(error?.name || 'Error') + ': ' + String(error?.message || error || '未知错误');
            for (const secret of [String(key).trim(), String(key).trim().replace(/^Bearer\s+/i, '')]) {
                if (secret) text = text.split(secret).join('[凭据已省略]');
            }
            return text.replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [凭据已省略]').replace(/pst-[\w-]+/g, '[凭据已省略]').slice(0,500);
        },
        stop() {
            stopped = true;
            for (const controller of pending) controller.abort(abortError());
            frame?.remove(); frame = null; cleanFetch = null;
        },
    };
}
