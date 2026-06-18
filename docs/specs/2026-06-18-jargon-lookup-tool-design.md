# Jargon Lookup Tool 设计文档

**日期：** 2026-06-18  
**分支：** `feature/function_calling_tool-lookup_jargon`  
**状态：** 已批准，待实现

---

## 背景

当前所有 agent 的 system prompt 中已通过 `buildSystemPrompt()` 内嵌了完整的黑话词库（284 条）。本 tool 的目标是提供一个结构化的程序化查询接口，让 agent 在推理过程中可以按需检索特定词条及其字段数据，而非依赖 prompt 中的静态文本块。

---

## 功能需求

1. **多词批量查询**：agent 可一次传入多个黑话词（1 到 100+），全部在一次 tool call 内处理。
2. **模糊匹配**：对 `jargon` 列使用 `LIKE '%term%'` 匹配，一个查询词可能命中多条记录。
3. **分组返回**：结果按查询词分组，`{ "查询词": [...匹配条目...] }`；查不到的词对应空数组 `[]`。
4. **默认返回所有字段**：不指定 `fields` 时，返回每条记录的全部列数据。
5. **自定义字段**：agent 可指定只返回哪些字段，减少不必要的数据传输。
6. **动态字段加载**：可用字段列表在进程启动时从 `PRAGMA table_info(jargon)` 动态读取，表结构变更后重启即生效，无需改代码。

---

## 架构

### 涉及文件

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `packages/db/src/jargon-queries.ts` | 新增函数 | DB 查询层：`getJargonColumns()` + `lookupJargonByTerms()` |
| `apps/api/src/agents/shared/jargon-lookup-tool.ts` | 新建 | Tool 定义，动态构造 Zod schema |
| `apps/api/src/agents/base/graph.ts` | 修改 | 将新 tool 加入 `allTools` |
| `packages/db/src/index.ts` | 不变 | `export * from "./jargon-queries"` 自动覆盖新函数 |

### 初始化流程

```
进程启动
  → jargon-lookup-tool.ts 模块加载
  → getJargonColumns() 执行 PRAGMA table_info(jargon)
  → 过滤 id 列，snake_case → camelCase 转换
  → 构造 z.enum([...fields])
  → jargonLookupTool 注册到 base/graph.ts 的 allTools
  → 所有 agent 均可调用
```

---

## DB 层详细设计

### `getJargonColumns(): string[]`

位置：`packages/db/src/jargon-queries.ts`

- 执行 `sqlite.prepare("PRAGMA table_info(jargon)").all()`
- 过滤掉 `id` 列
- 将 snake_case 列名转为 camelCase（`short_definition` → `shortDefinition`）
- 返回示例：`['jargon', 'shortDefinition', 'definition', 'easyUnderstanding', 'useExample', 'badExample']`

### `lookupJargonByTerms(terms: string[], fields?: string[]): Record<string, Partial<JargonEntry>[]>`

位置：`packages/db/src/jargon-queries.ts`

- 遍历每个 term，用 Drizzle `like(jargon.jargon, '%term%')` 查询
- 若 `fields` 指定，对每行结果做字段投影（`jargon` 列始终包含，用于可读性）
- 查不到结果的 term 在返回对象中对应 `[]`
- 返回类型：`Record<string, Partial<JargonEntry>[]>`

---

## Tool 层详细设计

### `jargonLookupTool`

位置：`apps/api/src/agents/shared/jargon-lookup-tool.ts`

**模块级初始化（一次性）：**
```ts
const AVAILABLE_FIELDS = getJargonColumns();
const fieldsEnum = z.enum(AVAILABLE_FIELDS as [string, ...string[]]);
```

**Tool 定义：**
- `name`：`"lookup_jargon"`
- `description`：`"在阿里黑话词库中查询一个或多个词条（模糊匹配），按查询词分组返回结果。"`
- `schema`：
  ```ts
  z.object({
    terms: z.array(z.string()).min(1).describe("要查询的黑话词列表，支持模糊匹配，可一次查询多个词"),
    fields: z.array(fieldsEnum).optional().describe("指定返回哪些字段；省略则返回全部字段"),
  })
  ```
- `handler`：调用 `lookupJargonByTerms(input.terms, input.fields)`，返回 `JSON.stringify(result)`

**返回格式示例（全字段）：**
```json
{
  "拉通": [
    {
      "jargon": "拉通",
      "shortDefinition": "把相关人拉到一起",
      "definition": "把相关方聚在一起对齐信息",
      "easyUnderstanding": "把相关人拉到一起",
      "useExample": "这个方案我们先拉通一下各方意见",
      "badExample": "今晚出去拉通一下关系"
    }
  ],
  "查不到的词": []
}
```

---

## `base/graph.ts` 修改

```ts
import { jargonLookupTool } from "../shared/jargon-lookup-tool";

// 原来
const allTools = [askUserTool, ...(opts.extraTools ?? [])];

// 改为
const allTools = [askUserTool, jargonLookupTool, ...(opts.extraTools ?? [])];
```

---

## 边界情况

| 情况 | 处理方式 |
|---|---|
| `terms` 中某词无匹配 | 该 key 对应 `[]`，不抛错 |
| `fields` 为空数组 | 等同于省略，返回全部字段 |
| `AVAILABLE_FIELDS` 为空（极端情况） | `z.enum([])` 会 Zod 报错；实际不可能，jargon 列始终存在 |
| 同一条记录被多个 term 匹配 | 在各自的分组中分别出现，不去重 |

---

## 不在范围内

- 不支持正则或全文检索（LIKE 模糊匹配已满足需求）
- 不支持排序或分页（词库体量小，全量返回）
- 不增加新的 HTTP 路由（纯 agent tool）
- 不修改现有 system prompt 中的静态词库块
