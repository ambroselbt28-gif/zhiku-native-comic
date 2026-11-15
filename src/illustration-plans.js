import { resolveImageCharacters } from './image-characters.js';

// The entire editable instruction lives here; request assembly adds data, not hidden rules.
const ILLUSTRATION_PROMPT_BASE = `你负责根据小说正文选择插图瞬间，并整理画面信息。

【图片数量】
必须正好写满输入 imageLimit 张，分散在正文前中后不同位置。正文里的瞬间不够时自己编：同一场景换景别和角度（特写、背影、俯拍）、写在场人物的反应、补正文没细写但合理的前后一刻，直到写满为止，不能少写。
每张图描绘一个独立瞬间，不把连续发生的动作塞进同一张图。

【正文范围】
存在 <content>...</content> 时，只从其中选择剧情画面。
忽略思考、状态栏、角色名单和正文之外的附加信息。
没有 content 标签时，使用提供的普通正文。

【画面选择】
优先选择体现角色情绪、人物互动或关键行动的瞬间。
明确这一刻：谁入画、在哪里、正在做什么、有什么表情。
角色被提及、被回忆、出现在名单中，不代表实际入画。
不要为了凑人数，把候选角色全部加入画面。

【人物与外貌】
候选角色资料用于识别名字、别名和固定外貌。
已登记的入画角色使用对应身份；未登记的人物按正文描述。
固定外貌沿用角色资料，动作、情绪和剧情服装以当前瞬间为准。
正文没有交代的信息不要当作已知事实。

【内容分级】
对应原文含成人性内容或私密部位裸露时，标记 nsfw，不得漏标，也不得标成 sfw。
分级与画面描述分开处理；画面标签完整描述非露骨的可见信息。
不能仅因角色性别、亲密关系或普通拥抱，就判定为 nsfw。

【画面标签：SFW 和 NSFW 均适用】
依据选定瞬间，完整描述剧情明确出现、且在当前镜头中可见的内容。
不要遗漏关键动作、情绪、物品及人物互动。
不要把先后发生的动作合并，也不要添加镜头外的人物和细节。
每个入画人物分别填写：身体姿势、朝向和重心；肢体动作、双手位置和物品；表情、视线和头部朝向；衣着状态；画面位置和前后层次。
多人画面还需填写：相对位置（面对面、并肩、一前一后等）、距离、朝向、遮挡、谁对谁做什么、主次关系。
整体构图填写：景别（特写到远景）、机位（平视、俯视、仰视、正侧背面）、主体位置、视觉重点、留白、前后层次、地点、关键物品、时间、光线和氛围。
剧情未指定的镜头与构图，可以选择适合表现该瞬间的方案；人物、事件和关键动作必须有正文依据。
标签使用英文，逗号分隔；场景与各角色标签分别输出。不添加画师串和质量词。
每个标签都写成 danbooru 风格的短标签（1 到 4 个词），不要写成整句或长短语：写 hand over mouth、covering mouth、hug from behind、tail around waist、whispering，不写 mouth and nose covered by boy's large hand、whispering near her ear 这类句子。

【输出格式】
mode=after：只输出 JSON：{"images":[画面对象]}，不输出分析过程。
mode=inline：其余正文照常写；逐图完成同样的选镜头、分级和人物分析，再在对应段落后，用输入 markers.start 和 markers.end 包住英文标签，不输出 JSON。格式为 Scene Composition: 分级、人数、场景、构图、互动标签; Character 1 Prompt: $角色名字-sfw-upperbody$, 该人物的姿势、动作、表情、视线、衣着、站位标签|centers:0.3,0.5; Character 2 Prompt: ...。登记角色用候选名字，未登记角色直接写英文外貌标签，不用角色标记；空镜仅有 Scene Composition。不得把人物标签合并到场景段。nsfw 画面必须以 Scene Composition: nsfw, 开头。sfw 也同样写完整姿势和构图。
每个画面对象必须包含：
source：从本次正文原样摘录的定位句（不少于 4 个字符）。
title：简短图片标题。
moment：一句话概括这个瞬间，不写分析过程。
rating：sfw 或 nsfw。
scene：英文环境、地点和关键物品标签。
composition：对象，包含 shot（景别）、camera（机位）、layout（布局和焦点）、lighting（光线），各字段为英文标签。
interaction：英文人物相对位置、距离、遮挡和互动关系标签；空镜可为空。
characters：实际入画人物数组，空镜用 []。每人包含：
name（名字）、registered（是否调用候选角色，布尔值）、gender（girl/boy/other）、appearance（未登记角色的英文外貌标签，登记角色可为空）、pose（姿势）、action（动作）、expression（表情）、gaze（视线）、outfit（此刻衣服）、position（对象：x、y 为 0 到 1 的画面坐标，depth 为 foreground/midground/background）、tags（其他英文细节，可为空）。
只有 name、source、title、moment 可以用中文，其余画面标签用英文。
characters 只列实际可见的人；人数标签由插件根据名单生成，scene 和各人物标签不另写人数。`;

const INTERACTION_GUIDANCE = `【视线与互动姿势】
候选资料里的固定视线与姿势要根据本次剧情重新判断，外貌、身份和服装规则继续沿用角色资料。
每人明确看向的对象和方向，分别填写 gaze 与 gaze_target。gaze_target 用英文物品名或人物的可见特征，例如 smartphone、seated man、person on left。眼睛闭合、背对镜头或面部不可见时按可见状态填写，目标可为空。
sharp gaze、cold gaze、watching calmly 描述神态，还需给出具体视线对象。人物拿手机时根据正文判断看手机还是看别人，观察他人时指出被观察的人。
按剧情选择各自的注意力目标。交谈或相互注视时可使用 looking at another、eye contact，其他瞬间可以看物品、看向别处或闭眼。looking at viewer 用于原文明确面对观看者、自拍或合影的镜头。
人物的身体朝向、头部朝向和视线分别描述。根据机位、左右站位和前后距离检查三者是否一致，避免一律正面站直、并排看镜头。
每个动作明确发起者、对象、接触部位和这一瞬间的受力姿势。递物写清谁递、谁接和物品所在位置，扶肩写清哪只手接触谁的肩膀，拉手写清双方的手与身体朝向。
手部只写镜头中可见的必要状态，检查同一只手没有同时拿两件物品或执行互斥动作。身体接触须与距离、遮挡和坐站姿势相容，前后相继的动作选其中一刻。
互动动作可以使用 source#、target#、mutual# 说明双方角色，例如主动伸手拥抱者用 source#hug、被拥抱者用 target#hug，相互拥抱时双方用 mutual#hug。双方动作与对象以正文为依据。
每个人可补充 body_direction（身体朝向）、head_direction（头部朝向）、hands（可见手部动作）、interaction_role（互动标签），均为英文字符串。旧格式中的 pose、action、gaze 字段继续填写。
短标签难以表达动作关系时，可补一句简短英文说明接触对象和动作归属，场景段概括关系，各人物段保留各自的动作。
例一为拿手机者坐在前景，另一人站在后方观察。前者 gaze=looking down、gaze_target=smartphone、hands=right hand reaching for smartphone，后者 gaze=looking at another、gaze_target=seated man。根据正文分别设置身体和头部方向。
例二为一人递书，另一人接书。前者 action=offering book、hands=right hand holding book，后者 action=reaching for book、hands=left hand reaching toward book，场景写 book between them。根据原文决定各自看书还是看对方。
输出前检查人物身份、动作对象、视线对象、可见双手、身体姿势、距离与画面位置是否相容。`;

const LEGACY_INTERACTION_PROMPT = ILLUSTRATION_PROMPT_BASE
    .replace('【输出格式】', INTERACTION_GUIDANCE + '\n\n【输出格式】')
    .replace('gaze（视线）、outfit', 'gaze（视线）、gaze_target（视线对象）、body_direction（身体朝向）、head_direction（头部朝向）、hands（可见手部动作）、interaction_role（互动标签）、outfit')
    .replace('每个标签都写成 danbooru 风格的短标签（1 到 4 个词），不要写成整句或长短语：写 hand over mouth、covering mouth、hug from behind、tail around waist、whispering，不写 mouth and nose covered by boy\'s large hand、whispering near her ear 这类句子。', '优先使用 danbooru 风格的短标签，必要时加简短英文说明，明确谁对谁做什么和具体接触位置。');

// 依据 NovelAI V5 专用技能与官方字段规则重新编写，供两个正文选镜入口共用。
export const NAI_STORY_GUIDANCE = `【NovelAI V5 画面表达】
用常见英文标签锁定人物动作、物件和机位，用一到两句简短英文说明标签无法说清的空间关系、动作对象和遮挡。自然语言是画面说明，不冒充已验证的 Danbooru 标签。优先表达这一瞬间的核心动作和人物反应，删掉重复、互斥或与画面无关的词。
场景段负责地点、机位、光线和人物之间的关系。每个人自己的动作、视线、持物、服装放在自己的角色段。固定发型、发色、眼睛、年龄感和体型由角色库提供，不为增加细节而重新设计，也不因为忧郁、疲倦就擅自添加伤疤、胡茬、脏污或衰老特征。
多人关系用明确对象写清谁对谁做什么，例如 The man on the left offers a cup to the seated woman. 每个人只补自己的动作。source#、target#、mutual# 可辅助绑定同一个互动，仍需明确对象。不要让每个人都复制同一套动作。
每人的视线要有实际目标，looking at another 需对应画面中的对象，交谈并不强制双方始终对视。看手机、看窗外、看对方、闭眼按正文分别处理。只有正文明确面对观看者、自拍或合影时才用 looking at viewer。
检查动作发生阶段和受力。伸手去拿与已经握住选一刻，坐姿有承重座面，倚靠有支撑物，每只可见的手只承担相容的动作。不要让双方隔着桌子却贴身拥抱，不要补写裁切外的手指或背面看不见的眼睛。
按关键动作选一种景别和一种主机位。双人递物要留出双方的手与道具，情绪重点可用近景，交代环境才用远景。同一张不堆 close-up、full body、wide shot；侧脸、三分之四和背面也只选符合正文的一种，不为好看而把人物强行转向镜头。
背景保留正文中的地点与少量关键大物件，形成明确前后关系。光线说明来源、方向及照到的物体，例如窗光落在脸侧、壁炉光映在衣褶。需要细节时写可见的头发层次、布料褶皱、玻璃反光等具体内容，不机械堆 detailed、8k 或添加 film grain、noise、sketch 等画风词。
保留当前画师串与用户风格。不要自行生成 artist:、质量词、负面词、采样参数、A1111 权重或整串高权重。high complexity、ultra complexity、depthness、fur dataset、background dataset 都不是通用画质前缀，不自动添加。实际画师、质量和负面由插件配置合并。
位置描述应与角色顺序及坐标相容，近景被遮挡的人不能同时写成无遮挡全身。输出前检查人数、外貌归属、动作对象、视线、手与道具、景别、光源是否一致。只输出最终画面，不输出推理过程。`;

const STORY_COUNT_RULE = '必须正好写满输入 imageLimit 张，分散在正文前中后不同位置。围绕已有剧情选择不同瞬间、人物反应或景别；同一事件可补充不改变剧情的观察角度，不编造新人物、新事件或未发生的结果。';
const LEGACY_COUNT_RULE = ILLUSTRATION_PROMPT_BASE.split('\n')[3];

export const DEFAULT_ILLUSTRATION_PROMPT = LEGACY_INTERACTION_PROMPT
    .replace(LEGACY_COUNT_RULE, STORY_COUNT_RULE)
    .replace('你负责根据小说正文选择插图瞬间，并整理画面信息。', '你负责把小说中的可见瞬间转为 NovelAI V5 插图方案，兼容标签与简短英文画面说明。')
    .replace('每个入画人物分别填写：身体姿势、朝向和重心；肢体动作、双手位置和物品；表情、视线和头部朝向；衣着状态；画面位置和前后层次。', '每个入画人物填写当前镜头可见且有意义的姿势、动作、表情、视线、服装和位置；可选细节无依据或不可见时留空，不为了填满字段增加动作。')
    .replace('整体构图填写：景别（特写到远景）、机位（平视、俯视、仰视、正侧背面）、主体位置、视觉重点、留白、前后层次、地点、关键物品、时间、光线和氛围。', '整体构图围绕一个视觉重点，选择匹配的景别、机位和前后层次，并写出有来源的光线与必要的环境细节。')
    .replace('【输出格式】', NAI_STORY_GUIDANCE + '\n\n【输出格式】')
    .replace('scene：英文环境、地点和关键物品标签。', 'scene：英文环境、地点和关键物品标签。\nscene_description：一到两句简短英文，补充本图最关键的可见空间或互动关系，不重复外貌；无需补充时为 ""。')
    .replace('action（动作）、expression', 'action（动作标签）、action_description（可选简短英文句子，说明该人物动作对象和持物归属）、expression')
    .replace('不得把人物标签合并到场景段。', '场景的简短英文关系说明放在 Scene Composition 段末尾，个人的英文动作说明放在对应 Character Prompt 段内。句子不要包含换行、分号、竖线或协议标题。不得把人物标签合并到场景段。');

export function illustrationPrompt(options = {}) {
    const p = typeof options.illustPrompt === 'string' ? options.illustPrompt : '';
    if (!p.trim()) return DEFAULT_ILLUSTRATION_PROMPT;
    const comparable = p.replace(/\r\n/g, '\n');
    // 仅升级完整匹配的旧默认文本，玩家编辑过的文本继续原样读取。
    const defaults = [ILLUSTRATION_PROMPT_BASE, LEGACY_INTERACTION_PROMPT, DEFAULT_ILLUSTRATION_PROMPT];
    const countRules = [LEGACY_COUNT_RULE, STORY_COUNT_RULE, '遵循输入 imageLimit（玩家设置的最多张数），不自行固定张数。', '按输入 imageLimit 写满张数：正文够长就写满 imageLimit 张，分散在正文前中后不同位置；只有正文太短、实在找不出这么多不同瞬间时才少写。'];
    for (const template of defaults) {
        for (const line of countRules) {
            if (comparable === template.replace(template.split('\n')[3], line)) return DEFAULT_ILLUSTRATION_PROMPT;
        }
    }
    return p;
}

export function saveIllustrationPrompt(options, value) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('提示词不能为空；需要默认内容时点「恢复默认」');
    options.illustPrompt = value; // Preserve the player's literal text, including whitespace.
}

export function illustrationCount(value = 1) {
    const count=Number(value);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('图片张数请填写大于 0 的整数');
    return count;
}

export function illustrationRequest({ options, mode, roster, markers, story = '', selectedPassage, prompt }) {
    const candidates = roster.filter(row => row.on).map(({ char }) => ({
        name: char.name, aliases: char.aliases || '',
        appearance: (char.appearance || []).map(t => t.en).filter(Boolean).join(', '),
        outfitMode: char.outfitMode,
        outfit: char.outfitMode === 'fixed' ? ((char.outfits || []).find(o => o.id === char.outfitId) || char.outfits?.[0])?.tags?.map(t => t.en).filter(Boolean).join(', ') || '' : '',
    }));
    const data = { mode, imageLimit: selectedPassage ? 1 : illustrationCount(options.illustMax ?? 1), markers, candidates, ...(mode === 'after' ? { story, ...(selectedPassage ? { selectedPassage } : {}) } : {}) };
    const system = prompt ?? illustrationPrompt(options);
    const user = JSON.stringify(data, null, 2);
    return { mode, system, user, injection: system + '\n\n【本次输入】\n' + user };
}

export function readIllustrationPlan(prompt) {
    const text = String(prompt || '').trim();
    if (!text.startsWith('{') || !/"(?:characters|composition|rating|moment)"\s*:/.test(text)) return null;
    try { return JSON.parse(text); } catch { throw new Error('画面方案 JSON 不完整，请编辑本图提示词后重试'); }
}

export function compileIllustrationPlan(plan, roster, story) {
    const required = key => {
        if (typeof plan?.[key] !== 'string' || !plan[key].trim()) throw new Error(`画面方案缺少 ${key}`);
        return plan[key].trim();
    };
    const source = required('source'), title = required('title'), moment = required('moment');
    if (source.length < 4 || (typeof story === 'string' && !story.includes(source))) throw new Error('画面定位句不在正文中，请重新选择瞬间');
    const rating = required('rating').toLowerCase();
    if (!['sfw', 'nsfw'].includes(rating)) throw new Error('画面分级必须是 sfw 或 nsfw');
    if (!Array.isArray(plan.characters)) throw new Error('画面方案缺少入画人物数组 characters');
    const clean = value => {
        if (value == null) return '';
        if (typeof value !== 'string' || /[㐀-鿿豈-﫿$<>\n]/.test(value)) throw new Error('画面标签需要英文，人物名字请放在 name 字段');
        // Count and rating are compiled once, from structured fields.
        return value.split(/[,;]+/).map(s => s.trim()).filter(s => s && !/^(?:\d+(?:boys?|girls?|others?)|solo|no humans|sfw|nsfw)$/i.test(s)).join(', ');
    };
    // 完整英文句子允许正常排版与分号；先检查协议，再整理为可往返的单行文本。
    const narrative = (value, field) => {
        if (value == null || value === '') return '';
        const fail = reason => { throw new Error(`画面说明 ${field}：${reason}`); };
        if (typeof value !== 'string') fail('需要英文字符串，不能是数组或对象');
        if (/[㐀-鿿豈-﫿]/.test(value)) fail('含中文，请改成英文句子；人物名字放在 name 字段');
        if (/[$<>|]|###|(?:Scene\s+Composition|Character\s+\d+\s+(?:Prompt|UC))\s*:/i.test(value)) fail('含人物标记或协议分隔符，请只填写英文画面说明');
        return value.replace(/[;；]\s*/g, ', ').replace(/\s+/g, ' ').trim();
    };
    const composition = plan.composition;
    if (!composition || typeof composition !== 'object') throw new Error('画面方案缺少镜头构图 composition');
    for (const field of ['shot', 'camera', 'layout', 'lighting']) if (!clean(composition[field])) throw new Error(`镜头构图缺少 ${field}`);
    const picks = [], cast = [], seen = new Set(), counts = {girl:0,boy:0,other:0};
    for (let person of plan.characters) {
        if (!person || typeof person.name !== 'string' || !person.name.trim() || /[$\n]/.test(person.name)) throw new Error('入画人物需要有效名字');
        // registered 只是模型的判断：在角色页找得到才算登记；找不到、没开、没写外貌都照样画
        const candidate = resolveImageCharacters('$' + person.name + '-sfw-upperbody$', roster).picks[0]?.char;
        let char = person.registered === false && !candidate?.autoProfile ? null : candidate;
        if (char?.autoProfile && !char.unregistered) person = { ...person, registered: true };
        if (char && !char.unregistered) cast.push(char);
        else { char = { name: person.name, appearance: [], outfits: [], outfitMode: 'story', negative: '', unregistered: true }; person = { ...person, registered: false }; }
        const identity = char.key || person.name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
        if (seen.has(identity)) throw new Error('同一人物在画面名单中出现两次，请合并动作');
        seen.add(identity);
        const registeredGender = (char.appearance || []).map(t => t.en?.trim().toLowerCase()).find(t => /^1(?:girl|boy|other)$/.test(t));
        let gender = registeredGender?.slice(1) || String(person.gender || '').toLowerCase().replace(/s$/, '');
        if (!Object.hasOwn(counts, gender)) gender = 'other';
        counts[gender]++;
        // 站位缺了或写错就用默认的，不为这个卡住出图
        const raw = person.position || {}, ok = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
        const pos = { x: ok(raw.x) ? raw.x : (picks.length + 1) / (plan.characters.length + 1), y: ok(raw.y) ? raw.y : 0.5, depth: ['foreground','midground','background'].includes(raw.depth) ? raw.depth : '' };
        const gazeTarget = clean(person.gaze_target);
        const gaze = clean(person.gaze);
        const targetTag = gazeTarget && !/\beyes closed\b/i.test(gaze.replace(/_/g, ' ')) && !gaze.toLowerCase().includes('looking at ' + gazeTarget.toLowerCase()) ? 'looking at ' + gazeTarget : '';
        const tags = [person.registered ? '' : person.appearance, person.pose, person.body_direction, person.action, person.hands, person.interaction_role, person.expression, gaze, targetTag, person.head_direction,
            char.outfitMode === 'fixed' ? '' : person.outfit, pos.x<0.4?'on left':pos.x>0.6?'on right':'centered', pos.depth, person.tags].map(clean).filter(Boolean).join(', ');
        picks.push({ char, tags: [tags, narrative(person.action_description, `characters[${picks.length}].action_description`)].filter(Boolean).join(', '), x:pos.x, y:pos.y });
    }
    const count = picks.length ? Object.entries(counts).filter(([,n])=>n).map(([g,n])=>`${n}${g}${n>1?'s':''}`).join(', ') : 'no humans';
    const scene = [rating, count, clean(required('scene')), ...['shot','camera','layout','lighting'].map(k=>clean(composition[k])), clean(plan.interaction), narrative(plan.scene_description, 'scene_description')].filter(Boolean).join(', ');
    return { scene, picks, cast, summary:{source,title,moment,rating} };
}

export function illustrationMarkerText(compiled) {
    const parts = ['Scene Composition: ' + compiled.scene];
    compiled.picks.forEach((p, i) => {
        const role = compiled.cast.includes(p.char) ? '$' + p.char.name + '-sfw-upperbody$' : '';
        parts.push(`Character ${i + 1} Prompt: ${[role,p.tags].filter(Boolean).join(', ')}|centers:${p.x},${p.y}`);
    });
    return parts.join('; ');
}

export function applyIllustrationRating(positive, rating) {
    if (!['sfw','nsfw'].includes(rating)) return positive;
    const rest=String(positive || '').split(',').map(t=>t.trim()).filter(t=>t&&!/^(?:sfw|nsfw)$/i.test(t));
    return [rating,...rest].join(', ');
}
