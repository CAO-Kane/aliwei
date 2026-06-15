# apps/api/src/agents — 多步 agent 落点

存放「多步 agent」：当某个工具的处理流程超出「单轮 streamText」、需要多步编排时，放在这里，与 `services/` 同级。

当前已落地：

```
agents/
└── weekly-reporter/    周报多步 agent（Prompt 8）
    ├── index.ts        编排：提取 → 润色 → 评审循环 → 输出
    └── skills.ts       原子技能：extractFacts / aliTransform / renderWeeklyReport
```

## 约定

- 每个 agent 一个子目录，拆成 `skills.ts`（原子技能函数，可复用）+ `index.ts`（编排入口，导出返回流式 Response 的函数）。
- `services/chat-service.ts` 按 `toolId` 分流调用，例如 `toolId === "weekly"` → `streamWeeklyReport(...)`。
- 采用手写编排（`async`/`for`/`if`），不引入框架。OKR、复盘等可照 weekly-reporter 同一套路新增，黑话润色等技能可直接复用。

## 为什么不开独立 `packages/ai`

多步 agent 是后端业务逻辑，前端只通过 HTTP 看流式响应、不会 import 它，所以塞在 api 内部跟 services 同级即可，不绕包。

## 远期可选：LangGraph

手写循环目前足够。只有当 agent 需要动态决策路径、模型自主调工具、状态持久化或多 agent 协作时，再考虑用 LangGraph 重写该 agent；在此之前不为简单流程提前引入。
