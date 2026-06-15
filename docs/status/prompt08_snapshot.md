# Aliwei Prompt 08 Status Snapshot

## 1. 基本信息

```text
Prompt 编号：Prompt 08
Prompt 名称：完善周报助手
执行人：ismy-cosmos
执行 AI：Claude
仓库：https://github.com/CAO-Kane/aliwei.git
基准分支：dev
功能分支：feature/weekly-agent
PR 链接：https://github.com/CAO-Kane/aliwei/pull/3
开始日期：2026-06-15
完成日期：2026-06-15
基于 commit：dev 最新（创建分支时）
当前 commit：d92cd60
```

---

## 2. 本次完成内容

```text
1. 实现周报「多步 agent」：把原单轮 streamText 升级为 extract → (transform → render → critic) 反思循环 → 暖心包装输出。
2. 新增 apps/api/src/agents/weekly-reporter/，拆出 3 个可复用 skill：
   - extractFacts：碎片化输入 → work/plans/difficulties/needs 四类结构化事实 + 篇幅风格判定。
   - aliTransform：白话事实 → 阿里味黑话润色（严格匹配字典，匹配不上保持白话，不硬塞）。
   - renderWeeklyReport：四类事实 → 标准周报 Markdown（纯函数，空类跳过）。
3. index.ts 编排 Actor-Critic 反思循环：核心事实循环外只抽一次（锁死语义防污染），循环内最多 3 轮，Critic 判 PASS 或满 3 轮交付。
4. chat-service.ts 增加 toolId=weekly 分流：命中走周报 agent，未命中走原通用单轮路径；助手消息入库逻辑抽成 persistAssistant 共享回调，周报与单轮复用。
5. prompts 分层：extract/transform 用新增的 buildToolPrompt（不带人设），最终输出用 buildLayeredPrompt（带人设+交互规范），Critic 只用裸字典 prompt。
6. WEEKLY_EXTRACT_TASK 重写为强制三步式（逐条摘原文 → 按时间词归类 → 数量自检），治丢事实/串时序/凭空加词。
```

---

## 3. 本次没有做的内容

```text
1. 未扩充黑话词典 jargon-dict.ts，未添加检索逻辑。
2. 未实现 Prompt 11（黑话翻译器），但 skills.ts 已封装好可复用 skill，P11 可直接调用、稍作优化。
3. apps/api/src/index.ts 加载 .env 的改动（import "dotenv/config"）未包含在本 PR（见已知问题 4）。
4. 周报 agent 的 difficulties/needs 识别仍偏弱，extract 偶有过度拆分，未做进一步精调。
```

---

## 4. 修改文件清单

```text
packages/domain/src/prompts/base.ts           新增 buildToolPrompt（不带人设的冷工序组装器）
packages/domain/src/prompts/weekly.ts         新增 4 个 L3 任务（提取三步式/转换/评审/输出）
packages/domain/src/prompts/index.ts          导出 buildToolPrompt + 周报 L3 任务
apps/api/src/agents/weekly-reporter/skills.ts 新增：extractFacts / aliTransform / renderWeeklyReport
apps/api/src/agents/weekly-reporter/index.ts  新增：streamWeeklyReport 编排 + Actor-Critic 反思循环
apps/api/src/services/chat-service.ts         增加 toolId=weekly 分流 + persistAssistant 共享回调
apps/api/package.json                          新增依赖 zod（skill 校验 JSON 输出用）
pnpm-lock.yaml                                 随 zod 安装自动更新

未包含在 PR：apps/api/src/index.ts（本地加了 import "dotenv/config"，见已知问题 4）
```

---

## 5. 新增 / 变更接口

```text
本 Prompt 没有接口变更。

说明：复用既有 POST /chat 端点。周报通过请求体 toolId="weekly" 触发，
返回仍是 UIMessage 流式响应（toUIMessageStreamResponse），与单轮路径一致。
```

---

## 6. 新增 / 变更工具和 Prompt

```text
工具 ID：weekly（chat-service.ts 里 WEEKLY_TOOL_ID 常量，需与 domain TOOLS 数组里「周报」项的 id 保持一致）
工具名称：周报助手（多步 agent）
修改 Prompt 文件：
  - packages/domain/src/prompts/base.ts：新增 buildToolPrompt
  - packages/domain/src/prompts/weekly.ts：新增 WEEKLY_EXTRACT_TASK / buildWeeklyTransformTask /
    buildWeeklyReviewTask / WEEKLY_OUTPUT_TASK
输出格式变化：
  周报由原"单轮对话式生成"改为"四段固定结构 Markdown"：
  ## 本周工作 / ## 下周计划完成的任务 / ## 遇到的困难 / ## 需要支持的需求（空类整段跳过），
  外层包裹暖心开场 + 阿里风追问。
```

---

## 7. 如何运行

```powershell
pnpm install
pnpm typecheck
pnpm lint
pnpm dev
```

Web：

```text
http://localhost:3000   （点「周报」工具按钮，输入碎片化工作描述）
```

API：

```text
http://localhost:3001
POST /chat  body: { "toolId":"weekly", "messages":[{ "id":"1","role":"user","parts":[{"type":"text","text":"..."}] }] }
```

注意：需在 apps/api/.env 配置 ALIBABA_API_KEY / ALIBABA_BASE_URL / MODEL_NAME，
且 apps/api/src/index.ts 需有 `import "dotenv/config"` 才能加载 .env（见已知问题 4）。

---

## 8. 测试结果

```text
pnpm typecheck：通过
pnpm lint：oxlint 通过（0 error 0 warning）；oxfmt --check 报格式问题，
  但属仓库缺少 oxfmt 配置导致的全量误报（含多个未改动文件），非本 PR 引入。
pnpm build：未单独执行
pnpm dev：通过（api 监听 3001，web 监听 3000）
Web 人工测试：通过（浏览器点周报按钮，端到端正常）
API 人工测试：通过（curl 需用 --data-binary 发 UTF-8 文件，否则 Windows 终端中文乱码）
Prompt 人工测试：通过（事实不捏造、时序分类正确、历史线程持久化入库）
```

---

## 9. 人工测试用例

```text
输入：这周开了几次会沟通讨论，写了下季度计划方案，还改了几个线上bug，下周想跟产品测试开会确认需求

预期：
  work = [开会沟通讨论, 写计划方案, 改线上bug]
  plans = [跟产品测试开会确认需求]
  difficulties = [] , needs = []
  最终输出为暖心开场 + 四段 Markdown 周报 + 阿里风追问，事实零捏造。

实际：
  extract 正确分出三件本周事（含 bug）+ 一件下周事；
  润色命中"对齐/拉通"等黑话，bug 等无对应词条的保持白话；
  Critic 第 1 轮 PASS；最终输出结构与事实均正确。

结论：通过。
（注：早期因 Windows 终端中文乱码，rawInput 到模型时变成 ���，导致模型瞎编；
  改用 curl --data-binary @文件 发 UTF-8 后恢复正常。此为终端问题，非代码问题。）
```

---

## 10. 已知问题

```text
1. 黑话密度偏低：jargon-dict.ts 仅 18 条，缺"修bug/写方案/压测"等日常技术工作对应黑话，
   按"严格匹配、不硬塞"铁律，这些事项会保持白话。解决方向：扩充词典（纯加数据，不改代码）。
2. extract 对 difficulties / needs 识别偏弱，且偶有过度拆分（把修饰/同一件事拆成多条）。
3. weekly-reporter/index.ts 内仍保留调试 console.log（[0.rawInput]/[1.extract]/[2.report]），
   上线前应删除（含用户输入打印，有隐私顾虑）。
4. apps/api/src/index.ts 的 `import "dotenv/config"` 未包含在本 PR。
   周报 agent 依赖 .env 读 ALIBABA_API_KEY，但 dev 当前 index.ts 无 env 加载机制，
   本地需自行加该行才能跑通。待团队确认 env 加载方案后单独处理。
5. apps/api 的 oxfmt 无配置文件，lint --check 会全量报格式问题（仓库级，非本 PR 引入）。
```

---

## 11. 对其他成员的影响

```text
Web Owner：无需改动；前端点「周报」按钮发 toolId="weekly" 即可触发，沿用既有流式渲染。
API Owner：chat-service.ts 增加了 weekly 分流分支；onFinish 入库逻辑抽成 persistAssistant，
  通用单轮路径行为不变。新增 zod 依赖。
Prompt / Domain Owner：prompts/base.ts 新增 buildToolPrompt（不影响 buildSystemPrompt/buildLayeredPrompt）；
  prompts/weekly.ts 新增周报 L3 任务，原 WEEKLY_SYSTEM_PROMPT/WEEKLY_STARTER 保留未动。
DB Owner：无 schema 变更；复用 createThread/insertMessage/touchThread。
DingTalk Owner：无影响；周报走同一套 POST /chat，钉钉端后续可直接复用。
Docs / QA Owner：需确认 dotenv（问题4）与 oxfmt 配置（问题5）两个仓库级事项。
```

---

## 12. 下一个 Prompt 开始前必须知道的事情

```text
1. 冷工序（提取/润色/校对）严禁走 buildLayeredPrompt：L1 的 HRBP+业务Leader 人设会污染提取。一律用 buildToolPrompt；Critic 用裸字典 prompt。
2. 周报核心事实在反思循环外只抽一次，循环内只改措辞，绝不重抽，防止评审意见反向污染事实。
3. 黑话白名单来自 formatDictForPrompt(JARGON_DICT)，全量喂入。要做 RAG 检索只改 index.ts 一处，
   其他文件零改动。
4. Windows 终端测中文必须用 curl --data-binary @utf8文件，直接 -d 发会乱码、导致模型收到 ��� 而瞎编。
```

---

## 13. 给下一个 AI 的继续指令

```text
你正在接手 Aliwei Agent 项目。

请先阅读以下文件：
- README.md
- TEAM_START_HERE.md
- docs/Aliwei_Git_Workflow.md
- docs/Aliwei_Agent_Task_Assignment_with_Prompts.md
- apps/api/src/agents/README.md
- docs/status/prompt08_snapshot.md

当前 Prompt 08（周报助手）已完成，不要重复实现。
若你负责 Prompt 11（黑话翻译器），可直接复用 apps/api/src/agents/weekly-reporter/skills.ts
里已封装的 aliTransform（白话→黑话）与提取逻辑，稍作优化即可，不必从零写。

你必须遵守：
1. 不要推倒重来
2. 不要重写无关模块
3. 不要提交 .env / key / token
4. 每完成一个 Prompt，继续写 docs/status/promptXX_snapshot.md
5. 运行 pnpm typecheck / lint / build，并记录结果
```
