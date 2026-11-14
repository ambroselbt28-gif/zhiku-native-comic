// 参考柏宝绘分镜风格与留白选项，规则按智库 @page 协议实现。
export const COMIC_PANEL_STYLES = [
    { id:'universal', label:'通用映画', description:'按剧情安排景别、主次与画格节奏。', rule:'' },
    { id:'eromanga', label:'大格特写', description:'以大画格呈现核心互动，搭配神态、手部或道具特写。', rule:'用一处较大的主画格交代人物互动和空间关系，在边角安排少量神态、手部接触或关键道具的特写切入。边框可随动作作斜切，特写对象以剧情为依据。' },
    { id:'shounen', label:'少年热血', description:'放大关键动作，以斜切画格和动势线突出冲击。', rule:'把关键动作安排在较大的画格中，多格时可用斜切边框衔接动作。根据实际动作使用 speed lines、motion lines 或 emphasis lines，人物动作和冲击点保持清晰。' },
    { id:'seinen', label:'悬疑推理', description:'用横向长格、线索和细微表情积累悬念。', rule:'用横向长格建立场景，再用眼神、微表情和关键线索特写组织揭示过程。通过画格大小和节奏表现停顿，环境保持克制。' },
    { id:'yonkoma', label:'经典四格', description:'每页固定四格，按起、承、转、合推进。', rule:'每页严格四格，@page 写 4 panels, vertical layout。以四个规整、大小均衡的矩形自上而下排列，依次承载铺垫、发展、转折和收束。最后一格落在当前剧情的结论或反应上。' },
    { id:'shoujo', label:'恋爱少女', description:'纵长人物格与表情特写，辅以柔和装饰和情绪留白。', rule:'使用纵长人物格和表情特写突出情绪变化，可用花卉、光点和柔和装饰组织画框，必要时使用 ornate border、falling petals。人物姿态和视线关系以剧情为依据，装饰服从所选留白方案。' },
    { id:'slice', label:'轻松日常', description:'画格稳定、间距舒缓，突出生活细节和自然反应。', rule:'以规整横格和均匀间距呈现生活细节、人物互动及细微反应，保持舒缓节奏。画格边界稳定，主次按事件安排，使用平直边框。' },
    { id:'comedy', label:'喜剧日常', description:'通过对切和夸张反应形成紧凑的喜剧节奏。', rule:'用规整画格组织动作与反应的快速对切，交替呈现普通表情、夸张反应和吐槽。保持人物关系、动作对象和笑点清楚，背景适度简化，重点反应可加 emphasis lines。' },
];

export const COMIC_GUTTERS = [
    { id:'follow', label:'按剧情安排', description:'由本页场景和画格布局决定留白。', rule:'' },
    { id:'bleed', label:'天地出血', description:'上下贴近页边，行内紧凑，跨行留出节奏间隔。', rule:'页顶和页底的关键画面延伸到页边。同行画格间距较窄，跨行间距适当放宽，可按剧情安排单侧出血，并在 @page 用英文写清边缘方向。' },
    { id:'boxed', label:'全封闭内框', description:'画格收在均匀的外白边里。', rule:'所有画格位于均匀的四周外白边内，使用 white border 和清楚的画格边界。@page 明确写出页面外白边，全部画格保持在内框范围。' },
    { id:'fullbleed', label:'沉浸全出血', description:'画面延伸到四周页边，通过内部边界区分画格。', rule:'整页画面延伸到四周边缘，使用 full bleed。相邻画格通过清晰的分隔线或构图边界区分，@page 明确写出全页出血布局。' },
    { id:'ink', label:'纯黑线无白边', description:'画格紧密相接，以粗黑线分隔。', rule:'画格紧密相接，四周外沿与格间均采用零白色间距。使用 black border，以清楚的粗黑墨线切分画格，@page 明确写出密接布局。' },
];

export function resolveComicLayout(options = {}) {
    const style = COMIC_PANEL_STYLES.find(item => item.id === options.panelStyle) || COMIC_PANEL_STYLES[0];
    const gutter = COMIC_GUTTERS.find(item => item.id === options.gutter) || COMIC_GUTTERS[0];
    return { style, gutter, panels:style.id === 'yonkoma' ? '4' : String(options.panels || '') };
}

export function comicLayoutInstructions(options = {}) {
    const { style, gutter } = resolveComicLayout(options);
    const rules = ['【漫画分镜与留白】',
        '按剧情需要选择远景、中景和近景。每格定格一个时刻，人物、道具、衣着和接触状态按正文跨格连续。位置与大小用英文写入 @page，并让 @panel 与人物的所属画格保持一致。',
        '普通多列页面按从右到左、再从上到下的顺序组织阅读。页数沿用本次任务，每页格数沿用本次选择，经典四格固定每页四格。格形和装饰服从单独选择的留白方案。'];
    if (style.rule) rules.push(`所选分镜风格为「${style.label}」。${style.rule}`);
    if (gutter.rule) rules.push(`所选留白方案为「${gutter.label}」。${gutter.rule}`);
    return rules.join('\n');
}

export function comicLayoutExample(options = {}) {
    const count = resolveComicLayout(options).style.id === 'yonkoma' ? 4 : 2;
    const positions = count === 4 ? ['top quarter','upper middle quarter','lower middle quarter','bottom quarter'] : ['top half','bottom half'];
    const pages = [
        { name:'等雨', scene:'cafe interior, rain on window', actions:['sitting, looking at window','holding a cup','putting cup on table','standing up'] },
        { name:'雨停后离开', scene:'wet street, street lights', actions:['opening cafe door','walking on sidewalk','looking at street sign','walking away'] },
    ];
    return '\n\n多页格式示例（正文包含等雨和离开两个剧情片段）：\n' + pages.map((page, index) => {
        const panels = positions.map((position, panel) => `@panel P${panel + 1}\n${position}, medium shot, ${page.scene}\n@character C1\nboy, black hair, grey eyes, white shirt, black vest, ${page.actions[panel]}`).join('\n');
        return `<comic_plan>第 ${index + 1} 页，剧情片段「${page.name}」，${count} 格。</comic_plan>\n<image>\n@page\nrating:general, 1boy, comic page, ${count} panels, vertical layout, ${page.scene}\n${panels}\nText: 「${index ? '回家吧。' : '又下雨了。'}」\n</image>`;
    }).join('\n\n');
}
