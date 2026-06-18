# `@aliwei/db`

SQLite (better-sqlite3) + Drizzle,aliwei 的本地持久化层。`apps/api` 的 chat 历史和阿里黑话词库都住在这里。

## 数据模型

三张表,全部在 `connection.ts` 用 `CREATE TABLE IF NOT EXISTS` 启动时建好(不走 drizzle-kit migrate):

| 表        | 用途                                        | 主键                       |
| --------- | ------------------------------------------- | -------------------------- |
| `threads` | 用户会话(按 `user_id` 隔离)                | `id TEXT`                  |
| `messages`| 单条 chat 消息,`content` 是 `UIMessage` JSON | `id TEXT`,FK → `threads`  |
| `jargon`  | 阿里黑话词库(从 `data/jargon.csv` 同步)     | `id INTEGER AUTOINCREMENT` |

Jargon 表结构:`jargon` (主键) + 5 个文本列(`short_definition` / `definition` / `easy_understanding` / `use_example` / `bad_example`)。

## 模块分工

- `connection.ts` — better-sqlite3 + Drizzle 连接,`CREATE TABLE` + WAL + 外键开关
- `client.ts` — 薄 re-export(让 `seedJargonFromCsv` 可以从 `connection` 反向 import `sqlite`,同时保持 `import { db } from "@aliwei/db"` 这个老入口仍然工作)
- `schema.ts` / `queries.ts` — `threads` / `messages` 的 Drizzle schema + 查询函数
- `jargon-schema.ts` / `jargon-queries.ts` — `jargon` 表的 Drizzle schema + 查询函数(`getAllJargon()` + `formatJargonForPrompt()`)
- `jargon-seed.ts` — CSV → DB 同步逻辑,见下

## 黑话词库:CSV 是真理

`packages/db/data/jargon.csv` 是 jargon 数据的唯一来源。`seedJargonFromCsv()` 在 `connection.ts` 初始化时同步执行:

1. 用 papaparse 解析 CSV(header 必填,空行跳过,header 前后空格 trim)
2. **单个事务**里:
   - `INSERT ... ON CONFLICT(jargon) DO UPDATE` —— 把 CSV 全部行 upsert 进 `jargon` 表,改了的列被覆盖
   - `DELETE ... WHERE jargon NOT IN (SELECT value FROM json_each(?))` —— 删掉 CSV 里没有的旧行(`json_each` 是 SQLite 内置,无新依赖)

**这意味着**:加行 / 改行 / 删行 → 改 CSV → 重启 api。当前 284 行 < 1ms,扩到 10k+ 之前不用挪到后台预热。

## `data/` 目录的 `.gitignore` 规则

`.gitignore` 里:

```
packages/db/data/*
!packages/db/data/jargon.csv
```

默认排除整个 `data/` 是为了**防止 seed/导出过程中产生的临时文件**被误提交;`!jargon.csv` 是豁免,把"真理"显式跟踪进 git。如果以后加新的 `*.csv` 词库,记得同步加 `!packages/db/data/<新文件名>.csv` 豁免。

## 怎么读 jargon

```ts
import { getAllJargon, formatJargonForPrompt } from "@aliwei/db";

const promptBlock = formatJargonForPrompt(getAllJargon());
// "【拉通】把相关人拉到一起... ✓例:... ✗忌:..."
```

`apps/api/src/agents/shared/prompts/base.ts::buildSystemPrompt` 在模块加载时调一次,把整段拼到 system prompt 的「阿里黑话词库」小节里。

## 环境变量

- `ALIWEI_DB_PATH` — SQLite 文件路径,默认 `./local.db`(相对 `process.cwd()`,所以 `apps/api` 启动时是 `apps/api/local.db`)

## 测试

`packages/db` 目前**没有 vitest config**。`jargon-seed` 的解析/upsert 行为靠 smoke test(`apps/api` 启动后 `curl /health` + 直接 sqlite 查表)验证。如果以后 parser 逻辑变复杂(多语言、引号转义、嵌套 CSV),需要补 `packages/db/vitest.config.ts` + `__tests__/jargon-seed.test.ts`。
