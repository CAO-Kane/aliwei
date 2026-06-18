# `apps/api/src/agents` — LangGraph 工具调用 & HITL 开发手册

> **本文档目标:** 让新加入的工程师在 1 小时内理解 aliwei 的 agent 架构、能动手加 tool、能为新需求扩展 HITL 流程。
>
> 读完本手册你应该能:
>
> - 画出 5 个 agent 共享的 `START → call_model → [run_tool | END]` 拓扑
> - 独立完成"在已有 agent 上加一个新 tool"的 5 步流程
> - 完整讲出 `ask_user` / `suggest_agent` 暂停 → 用户回答 → 续流 的全链路
> - 知道 `agentId` 这条命名约定贯穿了 DB → domain → API → 前端

---

## 1. 为什么是 LangGraph

5 个 agent(start 引导 / 黑话翻译 / 周报 / OKR / 复盘)必须共享一个执行地基,而不是每个 agent 单独维护 prompt + 工具调用 + 流式输出。原因:

- **工具必须后端执行。** `frontendTools` 没法和后端 `interrupt()` 协调,而且不能把只能服务端跑的副作用工具暴露给前端。
- **状态必须可暂停/续传。** `ask_user` / `suggest_agent` 这类 HITL 工具要求图在"等用户回答"时把 state 序列化、resume 时从同一状态接着跑。`SqliteSaver` 帮我们做到这一点;前端工具做不到。
- **模型自主决定调用流程。** `shouldContinue` 条件边让模型自己决定调不调工具、调哪个、调几次,而不是把流程写死在 system prompt 里让模型"记得"调。

> 💡 **为什么不选 X?** 本文不展开 langgraph vs Mastra vs AgentExecutor 的对比,只讲 aliwei 怎么用。决策理由记录在 `docs/superpowers/specs/2026-06-17-langgraph-migration-design.md` §12。

---

## 2. 架构总览

### 拓扑图

```
                    ┌─────────────────────┐
                    │  START              │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
             ┌──────│   call_model        │◀──────────┐
             │      │ (LLM 推理 + 工具绑定)│           │
             │      └──────────┬──────────┘           │
             │                 │                      │
             │                 ▼                      │
             │     ┌───────────────────────┐          │
             │     │ shouldContinue        │          │
             │     │ (有 tool_calls? )     │          │
             │     └─────┬──────────┬──────┘          │
             │           │          │                 │
             │       "tools"      [END]               │
             │           │          │                 │
             │           ▼          └──→ 结束         │
             │  ┌─────────────────────┐               │
             │  │   run_tool          │               │
             │  │ (ToolNode 执行工具)  │               │
             │  └──────────┬──────────┘               │
             │             │                          │
             └─────────────┴──────────────────────────┘
                  (ToolMessage push 进 messages)
```

**两个固定入口**:`START → call_model`(所有图一样);**一个灵活性来源**:`shouldContinue` 决定调工具还是结束。

### 5 个 Agent 对照表

| agentId | 状态扩展                      | 额外工具(在 askUserTool 之外) | graph 文件        | 用户可选    |
| ------- | ----------------------------- | ----------------------------- | ----------------- | ----------- |
| start   | `BaseState`                   | `suggestAgentTool`            | `start/graph.ts`  | ❌ 内部默认 |
| jargon  | `BaseState`                   | (无)                          | `jargon/graph.ts` | ✅          |
| weekly  | `BaseState`                   | (无)                          | `weekly/graph.ts` | ✅          |
| okr     | `OkrState` (+`okrDraft`)      | (无)                          | `okr/graph.ts`    | ✅          |
| review  | `ReviewState` (+`references`) | (无)                          | `review/graph.ts` | ✅          |

**对照表说明:**

- 5 个 agent 共用 `base/` 下的工厂函数,只在 graph 文件里传 3 个差异点(状态扩展、工具列表、system prompt 来源)。
- `start` 是 aliwei 默认入口 agent(用户没主动选时自动走它),只负责通过 `suggest_agent` 把用户引导到合适的专项 agent。它不出现在 `AGENTS` 数组里(`packages/domain/src/agents.ts`),只出现在 `AgentId` 类型里。
- okr / review 的额外工具(`breakdown_okr` / `search_past_okrs` / `search_past_reviews`)在 spec 里有规划,**目前都没实装**——它们的 graph 现在只有 askUserTool。`OkrState` / `ReviewState` 的扩展字段(`okrDraft` / `references`)同理,字段定义在 `state.ts` 但还没节点读写。

### 命名约定:`agentId` 一以贯之

**所有层都用 `agentId`(不是 `toolId`)**:DB `threads.agent_id` 列 → `@aliwei/domain` 的 `AgentId` 类型 → graph 工厂 `createBaseGraph({ agentId })` → state 字段 → 前端 thread context。早期代码用过 `toolId`,Phase 1 已经统一改名,现在仓库里不应该再有 `toolId` 残留。

### 目录树

```
apps/api/src/agents/
├── base/                              # 共享地基
│   ├── state.ts                       # BaseState / OkrState / ReviewState
│   ├── graph.ts                       # createBaseGraph 工厂
│   ├── nodes.ts                       # shouldContinue + makeCallModelNode
│   ├── model.ts                       # getChatModel (ChatOpenAI → 阿里通义)
│   └── checkpointer.ts                # SqliteSaver + WAL
├── shared/
│   ├── prompts/                       # ★ system prompt 模板
│   │   ├── base.ts                    #   buildSystemPrompt (通用规则 + 阿里黑话词库,词库从 @aliwei/db 读)
│   │   ├── jargon.ts                  #   JARGON_TOOL_PROMPT
│   │   ├── okr.ts                     #   OKR_TOOL_PROMPT
│   │   ├── review.ts                  #   REVIEW_TOOL_PROMPT
│   │   ├── weekly.ts                  #   WEEKLY_TOOL_PROMPT
│   │   ├── start.ts                   #   START_AGENT_PROMPT
│   │   └── index.ts                   #   barrel 导出
│   ├── tools.ts                       # askUserTool (interrupt 工具)
│   ├── suggest-agent-tool.ts          # suggestAgentTool (start 专用 interrupt 工具)
│   └── stream-adapter.ts              # langgraph events → UIMessageStream
├── start/graph.ts                     # createStartGraph + startStreamChat
├── jargon/graph.ts                    # createJargonGraph + jargonStreamChat
├── weekly/graph.ts                    # createWeeklyGraph + weeklyStreamChat
├── okr/graph.ts                       # createOkrGraph + okrStreamChat
└── review/graph.ts                    # createReviewGraph + reviewStreamChat
```

**`packages/domain` 的角色** —— 只剩两层:类型(`types.ts`)、AGENTS 注册表(`agents.ts`,纯元数据 + `findAgent` 工具函数)。**所有 system prompt 都已经在 api 侧,不在 domain 里;阿里黑话词库也不再放在 domain,而是迁到 `packages/db/data/jargon.csv`,启动时由 db 包同步到 SQLite 的 `jargon` 表,`buildSystemPrompt` 通过 `@aliwei/db` 的 `getAllJargon()` + `formatJargonForPrompt()` 读。**

### 调用入口

- `services/chat-service.ts::streamChat()` — 根据 `agentId` 选 graph,默认 `"start"`;持久化 user 消息;判定 resume 还是新对话
- `routes/chat.ts` 的 `POST /chat` — **唯一**入口,assistant-ui 的新消息 / `ask_user` resume / `suggest_agent` resume 都走这里。旧版 `POST /chat/continue` 端点已经移除
- Resume 的判定不靠端点区分,靠 `chat-service.ts:47` 的 `detectAskUserResume` 和 `chat-service.ts:76` 的 `detectSuggestAgentResume` 扫描请求里的 messages,看最后一条 assistant message 是不是"挂着没消费的 interrupt 输出"

---

## 3. 核心概念(30 分钟速查)

按新人首次接触顺序排列。每个概念都附 aliwei 代码定位。

### 3.1 State(状态对象)

LangGraph 的 State 是一个 typed 对象,在图的节点之间共享。在 aliwei 里,它是 `BaseState`(`base/state.ts:15`):

```ts
export const BaseState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ ... }),
  threadId: Annotation<string>(),
  agentId: Annotation<string>(),
  system: Annotation<string>(),
});
```

`OkrState` / `ReviewState` 是它的扩展版本(3.3 节)。

### 3.2 Annotation

声明 State 字段及其行为的工厂。`Annotation.Root({...})` 是入口;每个字段可以指定类型、reducer、默认值。

### 3.3 Reducer(合并规则)

`Annotation<T>({ reducer: (curr, update) => newValue, default: () => initial })`。

**关键不显然的事实:** aliwei 的 `messages` reducer 用 **append**(`[...curr, ...update]`)而不是 replace —— 因为模型每轮产出的 `AIMessage` / `ToolMessage` 都要追加到历史里。**reducers 的语义是"节点产出 + 现有值怎么合",不是"赋新值"。**

**Per-agent 扩展**用 spread `spec`(不是 spread `State`):

```ts
export const OkrState = Annotation.Root({
  ...BaseState.spec, // ← 这里是 .spec,不是 .State
  okrDraft: Annotation<OkrDraft | null>(),
});
```

`spec` 是 Annotation 的描述对象,`State` 是从 spec 推导出来的类型。spread spec 才能继续接 `Annotation<X>()`。

### 3.4 Checkpointer(状态持久化)

自动把每次 state 更新序列化到存储。aliwei 用 `SqliteSaver`(`base/checkpointer.ts:9`):

```ts
SqliteSaver.fromConnString(dbPath()); // dbPath 默认 "agent_state.db"
(cp as any).db?.pragma("journal_mode = WAL"); // 启动时设置 WAL: 读并发 + 单写者
```

`configurable.thread_id` 是 resume 的关键 — 用同一个 thread_id 调 `graph.stream` 时,langgraph 自动从 `agent_state` 表恢复最近一次 state。

**当前约束:单实例低并发部署。** 水平扩容要换 `PostgresSaver`。

### 3.5 `interrupt()`(同步暂停)

工具函数体内调用 `interrupt(payload)`,langgraph 立刻抛 `GraphInterrupt` 暂停图。resume 时,`interrupt(...)` 的**返回值**就是 `Command({ resume })` 里传入的值。

```ts
// shared/tools.ts:5-12
const answer = interrupt({ question, options });
return JSON.stringify({ selected: answer });
```

aliwei 当前有**两个** interrupt 工具:`askUserTool`(任何 agent 都能调,选项问答)和 `suggestAgentTool`(只 start agent 用,推荐切换专项 agent)。机制完全一致,只是 payload schema 不同。

### 3.6 `Command({ resume })`(续传容器)

```ts
import { Command } from "@langchain/langgraph";
graph.stream(new Command({ resume: answer }), { configurable: { thread_id } });
```

为什么用 `Command` 而不是 invoke?见 §6。

### 3.7 Prompt 组装分层(常被绕晕)

每个 graph 在 `systemPromptFn` 里调一次:

```
final system prompt = buildSystemPrompt(AGENT_PROMPT)
                     = 通用规则 + 阿里黑话词库 + agent 职责(AGENT_PROMPT) + 通用规则结尾
```

`buildSystemPrompt` 在 `shared/prompts/base.ts:5`,**所有 agent 共享同一份包装逻辑**。每个 agent 只负责写自己的 `*_TOOL_PROMPT` / `*_AGENT_PROMPT`(也就是"我作为这个 agent 的职责是什么")。

**黑话词库不是内嵌字符串** —— `buildSystemPrompt` 在模块加载时调一次 `getAllJargon()` + `formatJargonForPrompt()`,从 `@aliwei/db` 的 `jargon` 表读。改词库 = 改 `packages/db/data/jargon.csv` + 重启 api(`packages/db/src/jargon-seed.ts::seedJargonFromCsv` 启动时把 CSV 同步成表的镜像)。详细数据流见 `packages/db/README.md`。

**重要**:`buildSystemPrompt` 末尾会自动拼上:

> 当需要在 2-4 个方向中让用户挑选,或需要快速确认用户偏好时,调用 ask_user 工具给出选项

所以**写新 agent 的 prompt 时不要重复"记得用工具"这种话术**。

---

## 4. 地基实现解读

按文件逐个。**重点是"为什么这样写"。**

### 4.1 `state.ts` — 字段定义

- `messages: Annotation<BaseMessage[]>` — 用 append reducer,见 3.3
- `threadId` / `agentId` / `system` — 这三个不指定 reducer,默认是 replace
- `OkrState.spec` / `ReviewState.spec` — 用 spread spec 加新字段

**为什么 system 也存 state?** 不是为了持久化(每次 call_model 都会重新算),是为了在 `tools` 节点里也能读 system prompt(虽然目前用不到,但保持状态自包含是 langgraph 的风格)。

### 4.2 `nodes.ts` — 模型调用 + 路由

`shouldContinue`(`base/nodes.ts:22`):

```ts
export function shouldContinue(state): "tools" | typeof END {
  const last = state.messages.at(-1);
  if (!last || !isAIMessage(last)) return END;
  return last.tool_calls && last.tool_calls.length > 0 ? "tools" : END;
}
```

**为什么用 `isAIMessage` 类型守卫?**

`"tool_calls" in last` 会误命中 `ToolMessage`(它的 `tool_calls` 字段也是数组形式)。`isAIMessage` 在编译期就排除掉 HumanMessage / ToolMessage / SystemMessage,运行时不会出错。`langchain/core` 的 `isAIMessage` 是类型守卫,不是字符串比较。

`makeCallModelNode`(`base/nodes.ts:8`):

```ts
const system = systemPromptFn(state);
const messages: BaseMessage[] = [new SystemMessage(system), ...state.messages];
const ai: BaseMessage = await model.invoke(messages);
return { messages: [ai] };
```

**为什么 system message 每次重新算?** 因为 `systemPromptFn` 可能依赖 state(虽然现在都是 `() => buildSystemPrompt(X)`,不依赖),保持灵活。

### 4.3 `graph.ts` — 工厂

`createBaseGraph(opts)` 是唯一被 5 个 agent 调用的入口。

```ts
const allTools = [askUserTool, ...(opts.extraTools ?? [])];   // ← base/graph.ts:21
const toolNode = new ToolNode(allTools);
if (typeof opts.model.bindTools !== "function") {              // ← base/graph.ts:24
  throw new Error("createBaseGraph requires a model that supports bindTools()");
}
const modelWithTools = opts.model.bindTools(allTools);         // ← base/graph.ts:27
const graph = new StateGraph(stateAnnotation)
  .addNode("call_model", makeCallModelNode(...))
  .addNode("run_tool", (state) => toolNode.invoke(state))
  .addEdge(START, "call_model")
  .addConditionalEdges("call_model", shouldContinue, {
    tools: "run_tool",
    [END]: END,
  })
  .addEdge("run_tool", "call_model")
  .compile({ checkpointer: getCheckpointer() });
```

**`askUserTool` 永远在工具列表里(`base/graph.ts:21`)** — 任何 agent 都能调它,不需要在 `extraTools` 里重复加。

**为什么 `bindTools` 在 `addNode` 之前?** 因为 `call_model` 节点用 `modelWithTools` 而不是裸 `model`。bindTools 之后模型才知道可以调哪些工具。`base/graph.ts:24` 的运行时类型检查是为了在 `model` 不支持 `bindTools`(比如某些本地 mock 模型)时早失败。

**为什么 `run_tool` 用 `toolNode.invoke(state)`?** LangGraph 的 `ToolNode` 接受整个 state,自动从 `state.messages.at(-1)` 找 `tool_calls`、并行执行、把 `ToolMessage` push 回 state。

### 4.4 `checkpointer.ts` — 持久化

```ts
let _checkpointer: SqliteSaver | null = null; // 单例

function createCheckpointer(): SqliteSaver {
  const cp = SqliteSaver.fromConnString(dbPath());
  (cp as any).db?.pragma("journal_mode = WAL");
  return cp;
}
```

**单例的原因:** `SqliteSaver` 内部创建 better-sqlite3 连接。多个实例 = 多个连接 = 写锁竞争。WAL 模式给单实例下的读并发,但还是单写者。

**`configurable.thread_id` 直接复用 `threads.id`,** 不做 schema migration。`agent_state` 表是 langgraph 自管,不需要应用层干预。

### 4.5 `tools.ts` (ask_user) — HITL 工具本体

```ts
// shared/tools.ts:5-26
export const askUserTool = tool(
  (input: { question: string; options: string[] }) => {
    const answer = interrupt({ question: input.question, options: input.options });
    return JSON.stringify({ selected: answer });
  },
  {
    name: "ask_user",
    description: "向用户提一个 2-4 个选项的单选问题...",
    schema: z.object({
      question: z.string(),
      options: z.array(z.string()).min(2).max(4),
    }),
  },
);
```

**Schema 设计** — `options: z.array(z.string()).min(2).max(4)`:2-4 个选项单选,模型不能调出"开放性问题"(那种场景直接用普通对话)。

**返回值包成 `JSON.stringify({ selected })`** — 这样 `ToolMessage.content` 是个稳定的 JSON 字符串,LLM 解析起来一致(而不是任意对象)。

### 4.6 `suggest-agent-tool.ts` — start agent 专用 interrupt 工具

```ts
// shared/suggest-agent-tool.ts:5-26
export const suggestAgentTool = tool(
  (input: { agentId: string; reason: string }) => {
    const confirmed = interrupt({ agentId: input.agentId, reason: input.reason });
    return JSON.stringify({ confirmed });
  },
  {
    name: "suggest_agent",
    description: "当你判断用户意图明确时,推荐切换到某个专项 agent...",
    schema: z.object({
      agentId: z.enum(["weekly", "okr", "review", "jargon"]),
      reason: z.string(),
    }),
  },
);
```

**为什么和 ask_user 分两个文件?** 二者机制一样(`interrupt()` + `Command.resume`),但语义不同:`ask_user` 是任意 agent 都能用的"问用户偏好",`suggest_agent` 是 start agent 专用的"推荐切到 X 助手"。分两个工具:模型不会混淆,前端也好按 `type === "tool-ask_user"` / `type === "tool-suggest_agent"` 分别渲染卡片。

---

## 5. 加一个新 Tool 的 Step-by-Step

**目标案例:** 在 OKR agent 加一个 `suggest_okr_examples` 工具,接受一个 goal,返回 3 个 OKR 模板。

### Step 1:写工具

新建 `apps/api/src/agents/okr/tools.ts`(目前 okr 还没有这个文件,因为没有额外工具):

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const suggestOkrExamplesTool = tool(
  async ({ goal }: { goal: string }) => {
    return JSON.stringify({
      goal,
      examples: [
        { objective: "...", keyResults: ["KR1", "KR2", "KR3"] },
        { objective: "...", keyResults: ["KR1", "KR2", "KR3"] },
        { objective: "...", keyResults: ["KR1", "KR2", "KR3"] },
      ],
    });
  },
  {
    name: "suggest_okr_examples",
    description: "当用户对一个高层 goal 没有思路时,提供 3 个 OKR 模板供其参考/借鉴。",
    schema: z.object({
      goal: z.string().describe("用户描述的高层目标"),
    }),
  },
);
```

**命名约定:** `name` 用 snake_case(模型会原样使用),JS 变量用 camelCase + `Tool` 后缀。

### Step 2:挂到 graph

在 `apps/api/src/agents/okr/graph.ts` 的 `createBaseGraph` 调用里加 `extraTools`:

```ts
import { suggestOkrExamplesTool } from "./tools";

export function createOkrGraph(model) {
  return createBaseGraph({
    agentId: "okr",
    stateAnnotation: OkrState as any,
    systemPromptFn: () => buildSystemPrompt(OKR_TOOL_PROMPT),
    extraTools: [suggestOkrExamplesTool], // ← 加这里
    model,
  }) as any;
}
```

**不要改 `base/graph.ts`** — 那是共享地基,改它等于改所有 agent。`askUserTool` 已经在 base 里自动加上了,不要重复加。

### Step 3:更新 TOOL_PROMPT

在 `apps/api/src/agents/shared/prompts/okr.ts` 的 `OKR_TOOL_PROMPT` 字符串里加一段,告诉模型**何时**调这个工具:

```ts
export const OKR_TOOL_PROMPT = `你是一个 OKR 助手,支持四种模式:
...
**新增:** 当用户对如何写 OKR 没有思路时,调用 suggest_okr_examples 工具,先给出模板再引导修改。
`;
```

**不要改 `base.ts` 的通用规则** — 那是所有 agent 共享的。

### Step 4:(可选)更新 barrel

如果你新建了 prompt 文件,记得在 `shared/prompts/index.ts` 加导出。加 tool 不需要新建 prompt 文件时跳过这步。

### Step 5:验证

```bash
# 单元测试
pnpm --filter api test -- okr

# 手动端到端
pnpm --filter api dev
# 浏览器 → 选 OKR agent → 输入 "我想做用户增长" → 验证 suggest_okr_examples 被调到
```

### 红线

- **不在 `packages/domain` 里改任何文件** — prompts 早就迁走了,domain 是纯类型/数据层
- **不在 system prompt 里硬编码"用户可能的回答"** — 模型会僵化,失去泛化能力
- **不在 tool 体内 await 任何超过 5 秒的副作用** — 阻塞图节点;真要长任务请走异步节点
- **不要给 ask_user / suggest_agent 之外的工具加 `interrupt()`** — 那会破坏图的同步性,改用返回结果让模型决策
- **不要复活 `toolId` 这个名字** — 命名统一是 `agentId`

---

## 6. HITL 完整流程

aliwei 有两条 HITL 链路,机制一样,只是工具和触发场景不同:

| 工具            | 谁调           | 前端组件                        | resume 值类型          | 判定函数                                        |
| --------------- | -------------- | ------------------------------- | ---------------------- | ----------------------------------------------- |
| `ask_user`      | 任意 agent     | `AskUserCard` / `AskUserToolUI` | `string`(用户选的选项) | `detectAskUserResume` (chat-service.ts:47)      |
| `suggest_agent` | 只 start agent | `SuggestAgentToolUI`            | `boolean`(确认/拒绝)   | `detectSuggestAgentResume` (chat-service.ts:76) |

下面以 `ask_user` 为例讲全链路,`suggest_agent` 把"选项"替换成"确认/拒绝",其余等同。

### 6.1 全链路

```
 1. 模型决定调 ask_user → AIMessage 含 tool_calls
                ↓
 2. call_model → shouldContinue 命中 "tools"
                ↓
 3. run_tool → askUserTool 体内
                ↓
 4. interrupt({ question, options }) 抛 GraphInterrupt
                ↓
 5. checkpointer 序列化 state 到 agent_state 表
                ↓
 6. stream adapter 收到 on_tool_error(含 GraphInterrupt)
                ↓ extractInterruptValue (stream-adapter.ts:88) 把 interrupt payload 翻译成 tool-input-available 事件
                ↓
 7. 前端 AskUserCard 渲染选项
                ↓
 8. 用户点选 → 前端把答案 addResult 到原 part → 触发 transport 自动发出新的 POST /chat
                ↓ (注意:不走单独的 /chat/continue 端点,跟普通新消息走同一个端点)
 9. 后端 detectAskUserResume (chat-service.ts:47) 在请求 messages 里找到"挂着的 ask_user 输出"
                ↓
10. streamGraphToUIMessageStream(graph, new Command({ resume: answer }), threadId, onFinish, { isResume: true })
                ↓
11. ★ isResume=true 时 replay 阶段跳过所有 tool 事件
    图继续 → call_model → END → onFinish 写库
```

`suggest_agent` 的区别只在第 8 步:用户点"确认"后,前端会先把布尔值发回让 start agent 续流(start 看到 `{ confirmed: true }` 说一句移交语),然后**前端 remount ChatView**,把 `agentId` 切到推荐的专项 agent,并通过 `AutoSender` 把原始消息再发一次。这部分逻辑在 `apps/web/src/client/components/assistant.tsx`。

### 6.2 为什么用 `interrupt()` 而不是 frontend tool?

`interrupt()` 把"暂停"和"状态持久化"绑在一起。langgraph 在 interrupt 处自动保存 checkpoint,resume 时图从**同一** state 接着跑。frontend tool 需要在 app 侧手动维护 pending state,而且**没法**和 checkpointer 协同。

### 6.3 为什么用 `Command({ resume })` 而不是 `invoke()`?

`invoke()` 走完整图一次性返回最终 state,**不流**。用户回答后模型还要继续生成 tokens 流回前端,所以必须用 `stream`。`Command({ resume })` 是 langgraph 专门为 resume 设计的容器 — 它告诉图"从最近一个 interrupt 恢复,把 resume 的值传给 `interrupt(...)` 的返回值"。

### 6.4 `detectAskUserResume` 的"已消费"判定

`chat-service.ts:47` 的核心问题:**怎么区分"用户刚回答了一个 ask_user"和"用户开始了一轮新对话"?**

朴素做法 — "只要最新一条 assistant message 含 tool-ask_user output-available 就 resume" — 会出 bug:

> LLM 调完 ask_user、看到用户答案后,如果**继续**生成了 text / reasoning / 别的 tool 调用,说明它已经消费了答案。这时前端发新消息过来,如果无脑走 `Command.resume`,会把同一个 ToolMessage 重新喂给模型,模型重复生成相同内容,前端循环。

所以 `detectAskUserResume` 扫描最新 assistant message 的所有 part:

- 找到 `tool-ask_user` output-available → 记住 `selected`
- 之后如果**还有** text / reasoning / 别的 tool part → 标记 `consumed = true`
- 末尾 `consumed ? null : askUserAnswer`

只有"ask_user 是最新 assistant message 真正的最后一部分"时才走 resume,否则按新消息处理。`detectSuggestAgentResume`(`chat-service.ts:76`)是同一套逻辑,扫的是 `tool-suggest_agent`。

**两个判定的优先级:** `chat-service.ts:167-169` 先取 `detectAskUserResume`,再取 `detectSuggestAgentResume`,用 `??` 合并 — 当前一轮对话最多只有一个 interrupt 挂起,所以不会冲突。

### 6.5 为什么 resume 模式要跳过 tool 事件(只在 replay 阶段)

`stream-adapter.ts:124` 把 `options.isResume` 映射成一个**可变 flag** `skipToolEvents`:

```ts
let skipToolEvents = options?.isResume === true; // ← stream-adapter.ts:124
```

这个 flag 在 `on_tool_start` / `on_tool_end` / `on_tool_error` 三个分支里被检查:

```ts
} else if (event.event === "on_tool_start") {       // line 179
  if (skipToolEvents) continue;
  // ...
} else if (event.event === "on_tool_end") {         // line 195
  if (skipToolEvents) continue;
  // ...
} else if (event.event === "on_tool_error") {       // line 203
  if (skipToolEvents) continue;
  // ...
}
```

**为什么 resume 时 langgraph 会重发 tool 事件?**

Resume 时 langgraph **重新进入** `run_tool` 节点(`askUserTool` 的函数体再次执行,这次 `interrupt()` 直接拿到 resume 值返回),所以会发出**新的** `on_tool_start` / `on_tool_end` 事件,run_id 也是新的。

但前端的 tool part 已经在 `output-available` 状态(`addResult` 时设的):

- 如果我们发出 `tool-input-available` + 新 run_id → 前端创建重复 part
- 如果只发 `tool-output-available` 用新 run_id → 前端的 part matcher 找不到对应 part,直接丢

**但 `skipToolEvents` 不是全程为 true——只在 "replay 阶段"** 跳过。`on_chat_model_start` 触发时(进入新的 LLM step)flag 被重置:

```ts
} else if (event.event === "on_chat_model_start") {  // line 138
  skipToolEvents = false;                            // ← line 148: 进入新 LLM step,重新开始收集
  // ...
}
```

**理由**:用户回答完第一个 ask_user 之后,LLM 接下来完全可能**再调一次** ask_user(比如先问"哪个部门",回答完再问"哪个时间窗口")。第二次 ask_user 是"新的",必须正常显示给用户。所以 `skipToolEvents` 只屏蔽 replay 阶段的"老" tool 事件,不屏蔽 replay 之后的"新" tool 事件。

**resume 流程的 3 阶段:**

1. **Replay 阶段** — `skipToolEvents = true`,langgraph 重放 `run_tool` 节点产生的 `on_tool_start` / `on_tool_end` 全部被吞
2. **新 LLM step** — `on_chat_model_start` 触发,`skipToolEvents = false`,后续事件正常流到前端
3. **新工具调用(可选)** — 如果 LLM 在新 step 里再调工具,事件被正常处理(包括新的 ask_user)

### 6.6 为什么 prompts 末尾要硬编码"记得调 ask_user"?

之前这套机制在 domain 层用 `InstructionsInjector` 组件动态注入。迁到 api 后改成在 `buildSystemPrompt` 的通用规则里**硬编码**这条提示(`shared/prompts/base.ts:20`)。

**理由** ——

- 模型能不能"主动想到用 ask_user"是 prompt 问题,不是代码问题。改 tool 描述只能让模型"知道有这个工具",改 system prompt 才能让模型"知道何时调它"。
- 通用规则集中在 `base.ts` 一处,5 个 agent 的 prompt 都不用重复写。
- 新加 tool 时不需要碰这条规则(它属于 ask_user 自己的"使用指南")。

### 6.7 流式中断的已知限制

**langgraph 当前不支持"中断时已发 token 精确续传"。** 一次 `ask_user` 中断后,resume 重新进入图,LLM 之前的 text-delta **不会**被 replay。这点我们目前接受(前端会因为 tool part 重新出现而把不完整的 text 收起来)。

如果以后需要"精确续传",等 langgraph.js 0.3+ 引入 incremental checkpoint replay。

---

## 7. 调试速查

| 症状                                | 大概率原因                                                           | 看哪里                                                   |
| ----------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| 前端一直循环发 POST `/chat`         | `detectAskUserResume` / `detectSuggestAgentResume` 误判              | `chat-service.ts:47` / `:76` 的 consumed 判定            |
| 工具被调了但 LLM 看不到结果         | `bindTools` 漏在某个 `addNode` 之前                                  | `base/graph.ts:24-27`                                    |
| Resume 时前端多出一个空白 tool part | `skipToolEvents` 逻辑改坏了,replay 阶段没跳过                        | `stream-adapter.ts:124/148/180/196/204`                  |
| Resume 后第二次 `ask_user` 没显示   | `on_chat_model_start` 时 `skipToolEvents` 没重置                     | `stream-adapter.ts:148`                                  |
| 第二次 `ask_user` 后没 resume       | `extractInterruptValue` 没正确解析 GraphInterrupt 字符串             | `stream-adapter.ts:88`                                   |
| LLM 不调 ask_user(总是普通回答)     | `buildSystemPrompt` 末尾的 ask_user 提示被覆盖或丢失                 | `shared/prompts/base.ts:20`                              |
| start agent 不推荐切换              | `START_AGENT_PROMPT` 的"工作流程"被改坏,或前端 ChatView remount 失败 | `shared/prompts/start.ts` + `apps/web/.../assistant.tsx` |
| 用户切换 agent 后原消息丢了         | `AutoSender` 没把原文本带过去                                        | `apps/web/.../assistant.tsx::AutoSender`                 |
| 老代码报 `toolId is not defined`    | 没跟上 Phase 1 改名                                                  | 全局 grep `toolId`,统一改 `agentId`                      |

更详细的踩坑清单见 `docs/superpowers/known-pitfalls.md`(若有)。

---

## 8. 测试策略(一句话)

集成测试用 langgraph 的 `FakeChatModel` 硬编码 AIMessage 序列,跑完整图验证 state 演化。`ask_user` / `suggest_agent` 流程单独有单测覆盖 `detectAskUserResume` / `detectSuggestAgentResume` 的"已消费"判定。`pnpm --filter api test` 跑全部。

---

## 9. 相关文档

- **LangGraph 迁移设计:** `docs/superpowers/specs/2026-06-17-langgraph-migration-design.md`
- **Prompt 迁移设计:** `docs/superpowers/plans/2026-06-17-migrate-prompts-to-api.md`
- **Start agent + agentId 改名计划:** `docs/superpowers/plans/2026-06-17-start-agent.md`
- **LangGraph 官方文档:** https://langchain-ai.github.io/langgraphjs/
