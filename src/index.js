// 智库原生扩展入口：更新完成后安全切换运行时。
import { createUpdateReloader } from './update-reload.js';
let enabled = true;
let bootTimer = null;
let generating = false;
let revision = 0;
const ctx = globalThis.SillyTavern?.getContext?.();
const reloader = createUpdateReloader({
    load: async () => {
        checkHost();
        return import(new URL('./runtime.js?zhiku_reload=' + Date.now() + '-' + (++revision), import.meta.url).href);
    },
    canReload: () => !generating && !document.hidden,
    notify: (kind, message) => globalThis.toastr?.[kind]?.(message, '智库', { timeOut: 6000 }),
});

function checkHost() {
    const c = globalThis.SillyTavern?.getContext?.();
    const missing = [];
    if (!c) missing.push('SillyTavern.getContext');
    for (const key of ['getRequestHeaders', 'saveSettingsDebounced']) if (typeof c?.[key] !== 'function') missing.push(key);
    if (!c?.extensionSettings) missing.push('extensionSettings');
    if (!c?.eventSource?.on || !c?.eventSource?.removeListener || !c?.eventTypes?.APP_READY) missing.push('eventSource / APP_READY');
    if (missing.length) throw new Error('酒馆缺少接口：' + missing.join(', '));
    return c;
}

async function startExtension() {
    if (!enabled) return;
    try { await reloader.start(); }
    catch (error) { console.error('[智库扩展]', error); globalThis.toastr?.error(error.message, '智库启动失败'); }
}

function scheduleStart() {
    clearTimeout(bootTimer);
    bootTimer = setTimeout(() => { bootTimer = null; void startExtension(); }, 0);
}

// 智库写进酒馆「全局正则」的两条（生图标记不发送 / 生图标记折叠）。停用、删除智库时删掉，聊天显示就回到原样
const OWN_REGEX_IDS = ['72c57f73-46af-46ac-a28e-bf31b131332a', '6ba93a8e-cabb-494c-a7e8-6c9dfcf5fb80'];
function removeOwnRegex() {
    const c = globalThis.SillyTavern?.getContext?.();
    const rules = c?.extensionSettings?.regex;
    if (!Array.isArray(rules)) return;
    const left = rules.filter(r => !OWN_REGEX_IDS.includes(r?.id));
    if (left.length === rules.length) return;
    rules.splice(0, rules.length, ...left);
    c.saveSettingsDebounced?.();
    for (const el of document.querySelectorAll('.mes[mesid]')) {
        const id = Number(el.getAttribute('mesid')), msg = c.chat?.[id];
        if (msg) try { c.updateMessageBlock(id, msg); } catch { /* 这一楼重画失败不要紧 */ }
    }
}

export function onUpdate() { reloader.request(); }
globalThis.__zhikuRequestReload = onUpdate;
export function onEnable() { enabled = true; reloader.enable(); scheduleStart(); }
async function shutdown(permanent = false) {
    enabled = false;
    clearTimeout(bootTimer);
    if (permanent) {
        for (const [event, listener] of hostListeners) ctx?.eventSource?.removeListener(event, listener);
        if (globalThis.__zhikuRequestReload === onUpdate) delete globalThis.__zhikuRequestReload;
    }
    await reloader.stop({ permanent });
}
export async function onDisable() { await shutdown(); removeOwnRegex(); }
export async function onDelete() { await shutdown(true); removeOwnRegex(); }

const hostListeners = [];
function listen(type, listener) {
    const event = ctx?.eventTypes?.[type];
    if (event) { ctx.eventSource.on(event, listener); hostListeners.push([event, listener]); }
}
if (ctx?.eventSource && ctx?.eventTypes?.APP_READY) {
    listen('APP_READY', scheduleStart);
    listen('GENERATION_STARTED', () => { generating = true; });
    listen('GENERATION_ENDED', () => { generating = false; });
    listen('GENERATION_STOPPED', () => { generating = false; });
} else {
    globalThis.toastr?.error('当前酒馆缺少扩展启动接口，请升级 SillyTavern。', '智库');
}
// 关页面 / 刷新只收走自己挂上去的东西，正则留着
window.addEventListener('pagehide', () => { void shutdown(true); }, { once: true });
