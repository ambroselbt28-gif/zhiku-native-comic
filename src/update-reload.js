// 只切换智库运行时；不刷新宿主、不主动下载或安装更新。
export function createUpdateReloader({ load, canReload = () => true, notify = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
    let enabled = true, active = null, factory = null, version = '', serial = Promise.resolve();
    let requested = false, timer = null, disposed = false;
    const enqueue = task => {
        const next = serial.then(task);
        serial = next.catch(() => {});
        return next;
    };
    async function launch(make) {
        const candidate = make();
        try { await candidate.start(); }
        catch (error) { await candidate.stop().catch(() => {}); throw error; }
        active = candidate;
    }
    function arm() {
        if (disposed || !enabled || !requested || timer !== null) return;
        timer = schedule(() => { timer = null; void check(); }, 1000);
    }
    async function check() {
        await enqueue(async () => {
            if (!enabled || !requested) return;
            if (!active || !canReload() || active.canReload?.() === false) { arm(); return; }
            requested = false;
            let next;
            try {
                // 先载入并校验新代码，失败时旧版继续工作。
                next = await load(true);
                if (typeof next.createRuntime !== 'function') throw new Error('新版运行时缺少启动入口');
                if (!enabled) return;
                // 下载期间可能开始了新的生成或编辑，再检查一次。
                if (!canReload() || active.canReload?.() === false) { requested = true; arm(); return; }
                const previous = factory;
                const old = active;
                active = null;
                try {
                    await old.stop();
                    if (!enabled) return;
                    await launch(next.createRuntime);
                } catch (error) {
                    if (enabled && previous) {
                        try { await launch(previous); }
                        catch (recovery) { notify('error', '自动重载失败，恢复旧版也失败，请刷新页面。' + recovery.message); return; }
                    }
                    throw error;
                }
                factory = next.createRuntime;
                version = next.runtimeVersion || '';
                if (enabled) notify('success', `智库已自动重载${version ? ' · ' + version : ''}`);
            } catch (error) {
                notify('error', '重载失败：' + error.message + '。可在扩展设置点「重载智库」重试。');
            }
        });
        arm();
    }
    return {
        start() {
            return enqueue(async () => {
                if (!enabled || active) return;
                const module = await load(true);
                if (!enabled) return;
                await launch(module.createRuntime);
                factory = module.createRuntime;
                version = module.runtimeVersion || '';
                arm();
            });
        },
        request() {
            if (!enabled || disposed) return;
            requested = true;
            notify('info', '更新已就绪，空闲后自动重载智库。若正在编辑，请保存并关闭智库面板。');
            arm();
        },
        enable() { if (!disposed) enabled = true; },
        stop({ permanent = false } = {}) {
            enabled = false;
            disposed ||= permanent;
            requested = false;
            cancel(timer); timer = null;
            return enqueue(async () => {
                const old = active; active = null;
                if (old) await old.stop();
            });
        },
    };
}

// 跟踪完整操作 Promise（包含队列、重试与保存），不只跟踪 HTTP 响应。
export function createReloadActivity({ now = Date.now, quietMs = 3000 } = {}) {
    let count = 0, changed = now();
    return {
        idle: () => count === 0 && now() - changed >= quietMs,
        wrap(target) {
            for (const [key, original] of Object.entries(target)) {
                if (typeof original !== 'function') continue;
                target[key] = function (...args) {
                    const result = original.apply(this, args);
                    if (result && typeof result.then === 'function') {
                        count++; changed = now();
                        const finish = () => { count--; changed = now(); };
                        Promise.resolve(result).then(finish, finish);
                    }
                    return result;
                };
            }
            return target;
        },
    };
}
