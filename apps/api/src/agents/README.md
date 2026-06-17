# apps/api/src/agents — LangGraph.js 落点

4 个 AI 助手的统一 agent 地基。所有对话都跑在 LangGraph.js state graph 上。

## 目录

```
agents/
├── base/                       # 共享地基
│   ├── state.ts                # BaseState / OkrState / ReviewState
│   ├── graph.ts                # createBaseGraph 工厂
│   ├── nodes.ts                # shouldContinue + makeCallModelNode
│   ├── model.ts                # getChatModel (OpenAI 兼容 / 阿里 Moark)
│   └── checkpointer.ts         # SqliteSaver + WAL
├── shared/
│   ├── prompts/
│   │   ├── base.ts             # buildSystemPrompt (injects jargon dict)
│   │   ├── jargon.ts           # JARGON_TOOL_PROMPT
│   │   ├── okr.ts              # OKR_TOOL_PROMPT
│   │   ├── review.ts           # REVIEW_TOOL_PROMPT
│   │   ├── weekly.ts           # WEEKLY_TOOL_PROMPT
│   │   └── index.ts
│   ├── tools.ts                # askUserTool (带 interrupt)
│   └── stream-adapter.ts       # langgraph events → UIMessageStream
├── jargon/graph.ts
├── weekly/graph.ts             # + collect_weekly_items tool
├── okr/graph.ts                # + breakdown_okr + search_past_okrs
└── review/graph.ts             # + search_past_reviews
```

## 调用入口

`services/chat-service.ts` 根据 `toolId` 选择对应 graph factory，统一用 `streamGraphToUIMessageStream` 适配成 SSE。

`routes/chat.ts` 的 `POST /continue` 端点接收用户对 `ask_user` 的回答，用 `Command({ resume })` 恢复被 interrupt 暂停的图。

## 状态管理

- `state.messages` 由 LangGraph SqliteSaver 全权管理（单一来源）
- `app messages` 表是前端展示投影，`streamChat` 调用前写入 user msg
- `configurable.thread_id` = `threads.id`
