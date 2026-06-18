# 阿里职场 AI 助手

帮阿里员工搞定周报、OKR、复盘和黑话翻译 — 4 个工具,一个对话界面,跨 web/钉钉/小程序多端复用。

---

## 文件树

```
aliwei/
├── apps/
│   ├── web/         Next.js 16 前端 (3000)
│   ├── api/         Hono 后端 (3001)
│   └── dingtalk/    钉钉端占位
├── packages/
│   ├── domain/      工具定义 + Prompt + 黑话词典
│   ├── db/          SQLite + Drizzle
│   └── ui/          assistant-ui + shadcn
├── docs/            PROMPT.md / DEVELOP.md
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

## 依赖关系

```
apps/web      ──► @aliwei/domain   (拿 AGENTS 数组,渲染 4 个 agent 按钮+欢迎语)
              └─► @aliwei/ui       (assistant-ui + primitives + cn)

apps/api      ──► @aliwei/domain   (拿 AgentId / 黑话词库)
              └─► @aliwei/db       (持久化 threads + messages)

apps/dingtalk ──► (将来按需挑,跟 api 走同一套 HTTP 协议)
```

**单向依赖、不闭环**:
- 所有 app → packages,packages 之间互不引用(domain/db/ui 各管一摊)
- 改 web 不会影响 api 编译,改 api 不会影响 web bundle 大小

---

## 启动

```bash
pnpm install

cp apps/api/.env.example apps/api/.env            # 填 ALIBABA_API_KEY
cp apps/web/.env.example apps/web/.env.local      # 默认指向 http://localhost:3001

pnpm dev                                          # 并发跑 web (3000) + api (3001)
```

或者分开跑:
```bash
pnpm dev:api    # http://localhost:3001
pnpm dev:web    # http://localhost:3000
```

其他常用 script:
- `pnpm typecheck` — 所有包并行类型检查
- `pnpm lint` — 所有包并行 oxlint
- `pnpm format:fix` — 所有包并行 oxfmt + oxlint --fix

---

## 其他文档

- LangGraph + HITL 开发手册:[`apps/api/src/agents/README.md`](apps/api/src/agents/README.md)
- 钉钉端方案:[`apps/dingtalk/README.md`](apps/dingtalk/README.md)
