# 阿里职场 AI 助手

帮阿里员工搞定周报、OKR、复盘和黑话翻译 — 4 个工具,一个对话界面,跨 web/钉钉/小程序多端复用。

---

## 文件树

```
aliwei/                                pnpm workspace 根
│
├── apps/                              ★ 可独立部署的应用
│   │
│   ├── web/                           Next.js 16 前端 (端口 3000)
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/                   页面层 (无 API routes)
│   │   │   │   ├── layout.tsx         根 layout + 字体 + TooltipProvider
│   │   │   │   ├── page.tsx           首页 → <Assistant />
│   │   │   │   └── globals.css        只 @import "@aliwei/ui/styles.css"
│   │   │   └── client/                ★ 全部前端逻辑都在这
│   │   │       ├── components/
│   │   │       │   ├── assistant.tsx          主壳:工具按钮+ChatView+Sidebar
│   │   │       │   └── threadlist-sidebar.tsx 历史线程侧边栏 (业务组件)
│   │   │       ├── contexts/
│   │   │       │   └── thread-context.ts      ThreadContext + 类型
│   │   │       └── lib/
│   │   │           └── api.ts                 apiFetch() / apiUrl() helper
│   │   ├── .env.example               NEXT_PUBLIC_API_URL=http://localhost:3001
│   │   ├── components.json            shadcn aliases → @aliwei/ui
│   │   ├── next.config.ts             transpilePackages: [domain, ui]
│   │   ├── package.json               0 后端依赖
│   │   ├── postcss.config.mjs
│   │   └── tsconfig.json
│   │
│   ├── api/                           Hono 后端 (端口 3001)
│   │   ├── src/
│   │   │   ├── index.ts               Hono app + CORS + middleware + 路由挂载
│   │   │   ├── routes/                ★ HTTP 端点 (薄壳,只调 service)
│   │   │   │   ├── chat.ts            POST /chat (流式)
│   │   │   │   ├── threads.ts         GET / DELETE / GET messages
│   │   │   │   └── parse-pdf.ts       POST /parse-pdf
│   │   │   ├── services/              ★ 业务层
│   │   │   │   ├── chat-service.ts    streamChat() — 调 db + ai SDK
│   │   │   │   ├── thread-service.ts  list / load / remove
│   │   │   │   ├── pdf-service.ts     extractPdfText()
│   │   │   │   ├── llm-client.ts      createOpenAI + normalizeBaseUrl
│   │   │   │   └── guest-id.ts        cookie 解析/构造
│   │   │   ├── middleware/
│   │   │   │   └── guest-id.ts        Hono 中间件,c.var.userId 注入
│   │   │   └── agents/                ★ LangGraph.js 落点 (当前空)
│   │   │       └── README.md
│   │   ├── .env.example               ALIBABA_API_KEY + WEB_ORIGIN + PORT
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── dingtalk/                      钉钉端占位 (未实现)
│       ├── src/                       共用 apps/api 作后端
│       ├── package.json
│       └── README.md
│
├── packages/                          ★ 跨 app 共享的库
│   │
│   ├── domain/                        领域:prompts + 工具定义 + 黑话词典
│   │   ├── src/
│   │   │   ├── types.ts               Tool / ThreadMeta / ToolId
│   │   │   ├── tools.ts               TOOLS 数组 + findTool()
│   │   │   ├── jargon-dict.ts         JARGON_DICT[] + formatDictForPrompt()
│   │   │   ├── prompts/
│   │   │   │   ├── base.ts            buildSystemPrompt() — 拼黑话词库+工具职责
│   │   │   │   ├── jargon.ts          黑话翻译 prompt + starter
│   │   │   │   ├── weekly.ts          周报 prompt + starter
│   │   │   │   ├── okr.ts             OKR prompt + starter
│   │   │   │   ├── review.ts          复盘 prompt + starter
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── db/                            SQLite + Drizzle (只被 apps/api 引)
│   │   ├── src/
│   │   │   ├── schema.ts              threads / messages 表定义
│   │   │   ├── queries.ts             CRUD 函数
│   │   │   ├── client.ts              better-sqlite3 实例 + CREATE TABLE IF NOT EXISTS
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── ui/                            assistant-ui + shadcn 组件
│       ├── src/
│       │   ├── cn.ts                  twMerge(clsx(...)) — 唯一的 utility
│       │   ├── styles.css             Tailwind v4 + 设计变量
│       │   ├── assistant-ui/          assistant-ui 复合组件 (9 个)
│       │   │   ├── thread.tsx
│       │   │   ├── thread-list.tsx
│       │   │   ├── markdown-text.tsx
│       │   │   ├── reasoning.tsx
│       │   │   ├── attachment.tsx
│       │   │   ├── tool-fallback.tsx
│       │   │   ├── tool-group.tsx
│       │   │   ├── tooltip-icon-button.tsx
│       │   │   └── shiki-highlighter.tsx
│       │   ├── primitives/            shadcn 原子组件 (11 个)
│       │   │   ├── avatar.tsx
│       │   │   ├── breadcrumb.tsx
│       │   │   ├── button.tsx
│       │   │   ├── collapsible.tsx
│       │   │   ├── dialog.tsx
│       │   │   ├── input.tsx
│       │   │   ├── separator.tsx
│       │   │   ├── sheet.tsx
│       │   │   ├── sidebar.tsx
│       │   │   ├── skeleton.tsx
│       │   │   └── tooltip.tsx
│       │   ├── hooks/
│       │   │   └── use-mobile.ts
│       │   └── index.ts               桶导出
│       ├── package.json
│       └── tsconfig.json
│
├── docs/superpowers/specs/            设计文档
│   └── 2026-06-12-file-tree-restructure-design.md
│
├── .gitignore                         node_modules / .next / local.db / .env*
├── package.json                       根:并发跑 dev / 统一 lint / typecheck
├── pnpm-workspace.yaml                workspace 范围:apps/* + packages/*
├── tsconfig.base.json                 路径别名集中,各包 extends
└── README.md                          ← 你正在看的这份
```

---

## 依赖关系

```
apps/web      ──► @aliwei/domain   (拿 TOOLS 数组,渲染 4 个工具按钮+欢迎语)
              └─► @aliwei/ui       (assistant-ui + primitives + cn)

apps/api      ──► @aliwei/domain   (拿 systemPrompt 喂给 LLM)
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

- LangGraph 集成预留:[`apps/api/src/agents/README.md`](apps/api/src/agents/README.md)
- 钉钉端方案:[`apps/dingtalk/README.md`](apps/dingtalk/README.md)
