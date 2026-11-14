# NAI 5 正文提示词参考

核对日期为 2026-11-14。本次采用 NAI 5 专用资料，前期查看的通用视频分镜技能未作为此次规则来源。实现保留智库的 JSON 与标记协议，规则以项目需求重新编写，不将技能整包、脚本、标签库或示例图库加入扩展。

## 技能

- [BaguetteAron / NovelAI V5 Prompting](https://github.com/BaguetteAron/dsh-novelai-toolkit-DSH-NovelAI-/blob/main/skills/novelai-v5-prompting/SKILL.md) 与 [V5 规范](https://github.com/BaguetteAron/dsh-novelai-toolkit-DSH-NovelAI-/blob/main/skills/novelai-v5-prompting/references/novelai_v5_spec.md)。用于核对标签与英文场景句的分工、角色分栏、当前叙事阶段、视角可见性及避免重复质量词。
- [NPE 的 V5 写法参考](https://github.com/RefirmSaky/novelai-prompt-design-enhancer/blob/main/.agents/skills/npe/references/prompt-craft.md) 与 [姿势参考](https://github.com/RefirmSaky/novelai-prompt-design-enhancer/blob/main/.agents/skills/npe/references/pose-gesture-design.md)。用于核对动作对象、支撑与可见接触，以及减少竞争标签的方法。未套用整套审美预设、质量/负面模板或画师选择器。

## 官方依据

- [Multi-Character Prompting](https://docs.novelai.net/en/image/multiplecharacters/) 说明公共场景与人物栏分工、人数词、位置与 source#/target#/mutual#。动作前缀不能保证生成结果。
- [Tagging](https://docs.novelai.net/en/image/tags/) 与 [Image Generation Basics](https://docs.novelai.net/en/image/basics/) 用于核对标签和自然语言、提示词顺序。复杂度与数据集词不作为通用质量前缀。
- [Strengthening & Weakening](https://docs.novelai.net/en/image/strengthening-weakening/) 用于核对 NAI 权重语法，不引入 A1111 权重格式。

## 适配边界

1. 用户已有画师、负面、外貌档案和生成设置继续交给插件合并，文本 AI 只编写本图画面。
2. 普通方案增加可选英文关系说明字段，经过角色解析和最终请求链验证。旧格式继续接受。
3. 内置规则只在旧默认完整匹配时升级。自定义文本不自动拼入新规则，也不覆盖。
4. 未引入词库检索服务，未声称每个生成标签已被词库或 NAI 验证。自然语言明确作为画面说明。
5. 未改变坐标模式、分人物开关、模型或采样设置。未调用付费接口验证审美提升，合成回归只证明提示词传递、归属与兼容行为。


## 2026-11-15 漫画补充（Z015）

参考 [WeissGoat / nai5-comic-prompt](https://github.com/WeissGoat/nai5-comic-prompt-skill/blob/main/SKILL.md) 的 syntax、patterns 及相关示例，区分官方 API 事实与社区经验。项目自行编写镜头、动作和角色归属规则，不复制、发布其中的社区原图、私人服务器提示词、参考文件或技能包。

官方多人物文档确认 V5 可接受最多 22 条人物提示、位置与人物栏空间顺序应协调、人物栏各有负面。按画格给坐标的编译方式属于依据官方接口与社区经验做出的工程选择，不能据此保证分镜和画质。规则布局才推导坐标，复杂布局回退；人物外貌、画师、采样参数和手写坐标保留。

使用该技能的 check-prompt.mjs 在本地 .tmp 校验项目自行编写的四格合成请求：无错误、无警告、无提示（problems=[]）。只证明结构/参数符合检查项，不证明提示词不存在语义冲突或生图效果改善。未安装新依赖，未把第三方校验脚本打包进插件。
