export const ASK_STYLE_PROMPT = `调用ask_user工具询问用户的周报风格偏好。`;

export const COLLECT_INFO_PROMPT = `将用户提供的工作信息按周报栏目整理为草稿。
若用户提供了模板，按模板栏目整理；否则默认使用：本周工作、下周计划、困难/需求。
只基于用户提供的信息，不编造，不写黑话。`;

export const SELECT_CANDIDATES_PROMPT = `从以下黑话词表中挑出最适合用在这份周报里的词，最多选20个，用顿号分隔列出词名，直接输出词名列表，不要解释。

【周报内容】
{{organizedContent}}

【可用词表】
{{slangSummary}}

要求：词名须与词表完全一致，宁少勿多，不相关的词不选。`;

export const GENERATE_REPORT_PROMPT = `根据以下周报内容和已核实黑话条目生成最终周报。

【周报内容】
{{organizedContent}}

【已核实黑话条目】
{{verifiedEntries}}

【风格要求】
{{stylePreference}}

风格说明：
- 🔥 高度黑话：大量使用阿里词汇，适合汇报给阿里老员工
- ✅ 适度黑话：关键节点用黑话，整体易读（默认）
- 🌿 去黑话：完全用普通语言，适合外部合作方可见的周报

约束：
- 只使用已核实条目中的词，不编造黑话
- 数字、人名、项目名、时间保持原样
- 用户提供了模板则严格按模板栏目输出
只输出周报正文，从第一个栏目标题开始，不输出说明或过程。`;
