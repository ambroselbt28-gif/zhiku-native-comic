// 按剧情安排画格，不读取旧的分镜风格与留白模板设置。
export function comicLayoutInstructions() {
    return `【按剧情自由分镜】
先选择本页最重要的剧情瞬间，再决定画格数量、大小和阅读顺序。关键动作或情绪可以用大幅主画面，必要的反应或物件细节用小格补充；平静片段也可以只用一格。不要把所有页面机械画成等大矩形、固定四格或相同的上下/2x2布局，也不要为了变化强加斜格、装饰或插入特写。
每页根据剧情重新设计，不照搬前页或格式示例的格数、比例和留白。用户明确选择每页格数时遵从数量，布局仍按剧情安排。留白、边界和出血服务本页内容，不注入固定外框、网格或画风。
用英文在 @page 描述整体布局；每个 @panel 开头写清格的位置和大小，保持阅读顺序明确。每格一个可见瞬间，人物、道具、衣着与接触状态跨格连续。`;
}

export function comicLayoutExample() {
    return `

多页格式示例（仅示范协议与人物归属，格数和布局不能照抄）：
<comic_plan>第 1 页，剧情片段「等雨」；主画面表现等待，小格补充手部动作。</comic_plan>
<image>
@page
rating:general, 1boy, comic page, 2 panels, asymmetric layout, large upper panel with a small lower detail panel
@panel P1
top, large panel, medium shot, cafe interior, rain on window
Character C1 (Ren) sits by the window, watching the rain.
@character C1
Character C1 (Ren), boy, black hair, grey eyes, white shirt, black vest, sitting, looking at window
Text: 「又下雨了。」
@panel P2
bottom, small detail panel, close-up of a cup on the cafe table
Character C1 (Ren) rests his hand around the cup.
@character C1
Character C1 (Ren), boy, white shirt sleeve, one visible hand resting around a cup, face out of frame
</image>

<comic_plan>第 2 页，剧情片段「雨停后离开」；单幅画面收束离开。</comic_plan>
<image>
@page
rating:general, 1boy, comic page, 1 panel, full-page scene
@panel P1
center, full-page panel, wide shot, wet street outside a cafe
Character C1 (Ren) walks away from the cafe along the wet sidewalk.
@character C1
Character C1 (Ren), boy, black hair, grey eyes, white shirt, black vest, walking away, seen from behind
Text: 「回家吧。」
</image>`;
}
