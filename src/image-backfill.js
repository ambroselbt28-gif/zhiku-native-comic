import { isComicReply } from './comic.js';
import { imageStoryText } from './image-characters.js';

// 只调度当前聊天的楼层，方案生成、出图、保存与在途校验复用原有控制器。
export function createImageBackfill({ getContext, planner, marker, comic, validate = () => {} }) {
    const listeners = new Set();
    const chatKey = c => String(c.getCurrentChatId?.() ?? c.chatId ?? '') + '|' + String(c.characterId ?? '') + '|' + String(c.groupId ?? '');
    let state = { running: false, stopping: false, rows: [], reason: '' };
    let active = null, cancelled = false, stopped = false;
    const snapshot = () => ({ ...state, rows: state.rows.map(row => ({ ...row })) });
    const emit = () => { for (const listener of listeners) listener(snapshot()); };
    function inspect(id, mode) {
        const msg = getContext().chat?.[id];
        if (!isComicReply(msg)) return { eligible: false };
        const illustration = marker.status(id), pages = comic.status(id);
        if (!imageStoryText(msg.mes).trim() && !illustration.tokens && !pages.pages) return { eligible: false };
        const content = [...String(msg.mes || '').matchAll(/<content\b[^>]*>([\s\S]*?)<\/content\s*>/gi)];
        const body = (content.length ? content.map(block => block[1]).join('\n') : String(msg.mes || ''))
            .replace(/<(details|script|style|think|thinking|analysis)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
        const inline = /<img\b[^>]*\bsrc\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)/i.test(body) || /!\[[^\]]*\]\(\s*[^\s)]+/.test(body);
        // 两种图片分别补缺，任一流程在途时仍共用楼层忙碌保护。
        const images = mode === 'comic' ? pages.images : illustration.images + Number(inline);
        return { eligible: true, images, busy: illustration.busy || pages.busy || planner.status(id).busy };
    }
    function range(from, to) {
        const last = (getContext().chat?.length || 0) - 1;
        if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || from > to || to > last) throw new Error('请填写当前聊天中有效的起止楼层编号');
        return getContext().chat.slice(from, to + 1).map((msg, index) => ({ id: from + index, msg, source: msg?.mes, swipe: msg?.swipe_id }));
    }
    function preview(from, to, mode = 'ill') {
        const rows = range(from, to).map(row => inspect(row.id, mode));
        return { candidates: rows.filter(row => row.eligible && !row.images && !row.busy).length, images: rows.filter(row => row.eligible && row.images).length, busy: rows.filter(row => row.eligible && row.busy).length };
    }
    async function run(jobs, chat, mode) {
        try {
            for (const job of jobs) {
                if (cancelled || stopped) break;
                if (chatKey(getContext()) !== chat) { state.reason = '聊天已切换，补图已停止'; break; }
                const row = state.rows.find(row => row.id === job.id);
                const msg = getContext().chat?.[job.id], before = inspect(job.id, mode);
                if (msg !== job.msg || msg?.mes !== job.source || msg?.swipe_id !== job.swipe) {
                    Object.assign(row, { status: 'skipped', reason: '正文或候选回复已变化' }); emit(); continue;
                }
                if (!before.eligible || before.images || before.busy) {
                    Object.assign(row, { status: 'skipped', reason: before.images ? (mode === 'comic' ? '已有漫画' : '已有普通插图') : before.busy ? '正在生成' : '没有角色正文' }); emit(); continue;
                }
                row.status = 'working'; emit();
                try {
                    if (mode === 'comic') await comic.adapt(job.id);
                    else {
                        const markers = marker.status(job.id);
                        if (markers.tokens) await marker.process(job.id, { manual: true, tokenIndices: markers.missing });
                        else await planner.backfill(job.id);
                    }
                    const now = getContext();
                    if (chatKey(now) !== chat || now.chat?.[job.id] !== msg || msg.swipe_id !== job.swipe) {
                        Object.assign(row, { status: 'skipped', reason: '聊天或候选回复已变化' });
                    } else {
                        const generated = mode === 'comic' ? comic.status(job.id) : marker.status(job.id);
                        Object.assign(row, generated.images > 0
                            ? { status: 'done', reason: `已生成 ${generated.images} 张` }
                            : { status: 'failed', reason: generated.error || planner.status(job.id).error || '未生成图片，请查看楼层错误和问题记录' });
                    }
                } catch (error) { Object.assign(row, { status: 'failed', reason: error?.message || String(error) }); }
                emit();
            }
            if (chatKey(getContext()) !== chat) state.reason = '聊天已切换，补图已停止';
            else if (cancelled) state.reason = '补图已停止';
            else if (!stopped) state.reason = '本轮补图完成';
        } finally {
            for (const row of state.rows) if (row.status === 'queued') { row.status = 'skipped'; row.reason = '尚未执行'; }
            state.running = false; state.stopping = false; active = null; emit();
        }
        return snapshot();
    }
    function start({ from, to, mode = 'ill' }) {
        if (stopped) throw new Error('补图模块已停用，请刷新智库');
        if (state.running) return active;
        if (!['ill', 'comic'].includes(mode)) throw new Error('请选择普通插图或漫画');
        const jobs = range(from, to).filter(job => inspect(job.id, mode).eligible);
        if (!jobs.length) throw new Error('这个范围内没有可补图的角色回复');
        validate(mode);
        cancelled = false;
        state = { running: true, stopping: false, mode, from, to, reason: '', rows: jobs.map(job => ({ id: job.id, status: 'queued', reason: '' })) };
        active = run(jobs, chatKey(getContext()), mode);
        return active;
    }
    function cancel() { if (state.running) { cancelled = true; state.stopping = true; emit(); } }
    return { start, preview, snapshot, cancel, chatChanged: cancel,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        stop() { stopped = true; cancel(); listeners.clear(); },
    };
}

export function createImageBackfillUI({ controller, getContext, modal, esc, apiLabel }) {
    let box = null, unsubscribe = () => {};
    function open(mode = 'ill') {
        unsubscribe(); box?.closeModal();
        const previous = controller.snapshot(), last = Math.max(0, (getContext().chat?.length || 0) - 1);
        box = modal(`<h3 class="pc-h3">补未生图楼层</h3>
          <div class="pc-hint">按聊天 # 编号填写，起止楼层均包含。已有所选类型图片的楼层会跳过，普通插图和漫画分别补缺。正在生成的楼层会跳过，隐藏的角色回复也可补图。</div>
          <label class="pc-label">补图类型</label><select class="pc-input" data-backfill-mode><option value="ill">普通插图</option><option value="comic">漫画</option></select>
          <div style="display:flex;gap:12px;flex-wrap:wrap"><label style="flex:1;min-width:100px">起始楼层<input class="pc-input" style="width:100%;box-sizing:border-box" type="number" min="0" step="1" inputmode="numeric" data-backfill-from value="${previous.from ?? 0}"></label><label style="flex:1;min-width:100px">结束楼层<input class="pc-input" style="width:100%;box-sizing:border-box" type="number" min="0" step="1" inputmode="numeric" data-backfill-to value="${previous.to ?? last}"></label></div>
          <p class="pc-hint" data-backfill-api></p><p class="pc-hint" data-backfill-preview></p>
          <div class="pc-actions wrap"><button class="pc-btn dark" data-backfill-start>开始补图</button><button class="pc-btn" data-backfill-stop disabled>停止补图</button><button class="pc-btn" data-backfill-close>关闭</button></div>
          <p role="status" aria-live="polite" data-backfill-status></p><div style="max-height:38vh;overflow:auto;overflow-wrap:anywhere" data-backfill-results></div>`);
        const currentBox = box, find = selector => currentBox.querySelector(selector);
        find('[data-backfill-mode]').value = previous.running ? previous.mode : mode;
        const options = () => ({ from: find('[data-backfill-from]').valueAsNumber, to: find('[data-backfill-to]').valueAsNumber, mode: find('[data-backfill-mode]').value });
        function preview() {
            const { from, to, mode } = options();
            find('[data-backfill-api]').textContent = `文字 AI · ${apiLabel(mode)}。缺少画面方案时调用，出图沿用当前生图设置，会消耗相应额度。`;
            try { const counts = controller.preview(from, to, mode); find('[data-backfill-preview]').textContent = `可补 ${counts.candidates} 楼 · 已有${mode === 'comic' ? '漫画' : '普通插图'} ${counts.images} 楼 · 生成中 ${counts.busy} 楼`; }
            catch (error) { find('[data-backfill-preview]').textContent = error.message; }
        }
        function render(state) {
            for (const selector of ['[data-backfill-from]', '[data-backfill-to]', '[data-backfill-mode]', '[data-backfill-start]']) find(selector).disabled = state.running;
            find('[data-backfill-stop]').disabled = !state.running || state.stopping;
            const count = status => state.rows.filter(row => row.status === status).length;
            const working = state.rows.find(row => row.status === 'working');
            const status = state.stopping ? '正在停止，等待当前楼层收尾' : state.running ? `正在补第 ${working?.id ?? '…'} 楼` : state.reason;
            find('[data-backfill-status]').textContent = `${status} · 成功 ${count('done')} · 跳过 ${count('skipped')} · 失败 ${count('failed')}`;
            const labels = { queued: '排队', working: '生成中', done: '成功', skipped: '跳过', failed: '失败' };
            find('[data-backfill-results]').innerHTML = state.rows.map(row => `<div>#${row.id} · ${labels[row.status]} ${esc(row.reason)}</div>`).join('');
            if (!state.running) preview();
        }
        currentBox.addEventListener('change', preview);
        find('[data-backfill-start]').onclick = async () => {
            try { await controller.start(options()); }
            catch (error) { find('[data-backfill-status]').textContent = error.message; }
        };
        find('[data-backfill-stop]').onclick = () => controller.cancel();
        find('[data-backfill-close]').onclick = () => { unsubscribe(); currentBox.closeModal(); };
        unsubscribe = controller.subscribe(state => { if (currentBox.isConnected) render(state); else unsubscribe(); });
        preview(); render(previous);
        return currentBox;
    }
    return { open, stop() { unsubscribe(); box?.closeModal(); box = null; } };
}
