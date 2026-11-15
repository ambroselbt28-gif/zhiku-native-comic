import assert from 'node:assert/strict';
import { CINEMATIC_PRESET_TEXT } from '../src/cinematic-preset.js';

export function applyCinematicPreset(source) {
    const patch = (from, to, count = 1) => {
        assert.equal(source.split(from).length, count + 1, '镜头预设入口：' + from.slice(0, 70));
        source = source.replaceAll(from, to);
    };
    // 只更改无配置时的默认值，已有 active（包括酒馆、plain、自定义）保持原样。
    patch("{ active: 'tavern:', list: {}, fn: {}, markOn: {} }", "{ active: 'builtin:cinematic', list: {}, fn: {}, markOn: {} }", 3);
    patch("if (typeof d.aiPresets.active !== 'string') d.aiPresets.active = 'tavern:';", "if (typeof d.aiPresets.active !== 'string') d.aiPresets.active = 'builtin:cinematic';");
    const entries = [
        { id:'cinematic', n:'镜头与行动', r:'system', on:true, t:CINEMATIC_PRESET_TEXT },
        { id:'ctx', n:'上下文', r:'user', on:true, ctx:true },
    ];
    patch("    if (active === 'plain') return", "    if (active === 'builtin:cinematic') return " + JSON.stringify(entries) + ";\n    if (active === 'plain') return");
    patch("const kind = act === 'plain' ? 'plain' :", "const kind = act === 'builtin:cinematic' ? 'builtin' : act === 'plain' ? 'plain' :");
    patch("${chip('plain', '不套预设')}", "${chip('builtin:cinematic', '镜头与行动（推荐）')}${chip('plain', '不套预设')}");
    patch("${kind === 'plain' ? '<div class=\"pc-hint\">", "${kind === 'builtin' ? '<div class=\"pc-hint\">先确定剧情瞬间，再设计镜头，用英文句子描述行动。读外貌与翻译继续遵循各自任务。可复制一份自行修改。</div>' : ''}\n        ${kind === 'plain' ? '<div class=\"pc-hint\">");
    patch("${kind === 'tavern' ? '<button class=\"pc-btn dark\" data-act=\"aipcopy\">", "${kind === 'tavern' || kind === 'builtin' ? '<button class=\"pc-btn dark\" data-act=\"aipcopy\">");
    patch("name: (act.slice(7) || T.currentTavernPreset() || '酒馆预设') + ' · 副本'", "name: (act === 'builtin:cinematic' ? '镜头与行动' : act.slice(7) || T.currentTavernPreset() || '酒馆预设') + ' · 副本'");
    patch('跟着酒馆的预设，这里只能看</div><textarea', "${cfg.active === 'builtin:cinematic' ? '内置镜头预设，可复制后编辑' : '跟着酒馆的预设，这里只能看'}</div><textarea");
    patch("return a === 'plain' ? '不套预设' :", "return a === 'builtin:cinematic' ? '镜头与行动' : a === 'plain' ? '不套预设' :");
    patch("const preset = act === 'plain' ? '不套预设' :", "const preset = act === 'builtin:cinematic' ? '内置预设「镜头与行动」' : act === 'plain' ? '不套预设' :");
    return source;
}
