import fs from 'node:fs';
import assert from 'node:assert/strict';
import { NAI_STORY_GUIDANCE } from '../src/illustration-plans.js';

export function applyStoryInteractions(source) {
    // 楼层手动生图走旧 scene 入口，也使用同一份 NAI 画面规则。
    const legacy = '规则：只用常见 Danbooru 英文标签；不写画师，不写质量词，不写长相；x、y 是角色在画面里的大概位置。';
    assert.equal(source.split(legacy).length, 2, '手动画面提示词入口');
    source = source.replace(legacy, () => NAI_STORY_GUIDANCE + '\nscene 可包含英文场景关系句，characters[].tags 可包含该人物的简短动作说明。保持上述 JSON 字段，x、y 是人物的大概位置。');
    const start = source.indexOf('function buildChatPrompt(scene, picks, { nsfw = hasNsfwRating(scene) } = {}) {');
    const end = source.indexOf('/** 名字和别名', start);
    assert(start >= 0 && end > start, '剧情互动合并入口');
    let body = source.slice(start, end);
    const patch = (from, to, count = 1) => {
        assert.equal(body.split(from).length, count + 1, from);
        body = body.replaceAll(from, to);
    };
    patch("    const artist = d.active ? M.ticketString(d, d.active) : '';", "    const story = [scene, ...picks.map(p => p.tags)].filter(Boolean).join(', ');\n    const artist = preferStoryTags(d.active ? M.ticketString(d, d.active) : '', story, M);");
    patch("d.options.chatPositive || ''", "preferStoryTags(d.options.chatPositive || '', story, M)");
    patch('fixedTags(p.char, { nsfw })', "preferStoryTags(fixedTags(p.char, { nsfw }), [scene, p.tags].filter(Boolean).join(', '), M)", 2);
    const helper = fs.readFileSync(new URL('../src/story-interactions.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/^export /gm, '');
    return source.slice(0, start) + helper + '\n' + body + source.slice(end);
}
