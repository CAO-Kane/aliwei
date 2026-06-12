# apps/api/src/agents — LangGraph.js 落点

后续接入 LangGraph 时,图定义放这里。当前是空目录。

## 计划用法

当 `services/chat-service.ts` 的工具流需要从「单轮 streamText」升级为「多步 agent」时(例如:让 OKR 助手能调用工具拆解目标、让复盘助手能搜索历史复盘),把图定义放到这里:

```
agents/
├── okr-planner/
│   ├── graph.ts       # createGraph()
│   ├── nodes.ts       # 节点函数
│   └── state.ts       # 状态 schema
└── shared/
    └── checkpointer.ts  # 可选:状态持久化
```

`services/chat-service.ts` 通过 `import { okrPlanner } from "@/agents/okr-planner"` 调用,把 `streamText` 换成 `graph.stream()` 即可。

## 为什么不开独立 `packages/ai`

LangGraph 图是后端业务逻辑,前端不会 import 它(前端只通过 HTTP 看流式响应)。塞在 api 内部跟其他 services 同级最直接,不需要绕一层包。

如果以后改用 Python LangGraph,本目录整体迁出去成为 `services/agent-py/`,api 改成 HTTP/WS 调它,前端零感知。
