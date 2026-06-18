# Document Parsing Design

**Date:** 2026-06-18  
**Status:** Draft  
**Scope:** 全局文档解析（PDF / Word），适用于所有 4 个 agent

---

## 1. 背景与目标

用户在与任意 agent（黑话翻译器、周报助手、OKR 助手、复盘助手）对话时，希望能直接上传 PDF 或 Word 文档，由 agent 基于文档内容进行处理。

**目标：**
- 支持上传 `.pdf`、`.docx`、`.doc` 文件，支持同时上传多个文件
- 提取文件中的文字，以带文件名标注的文档上下文块形式传入 agent
- 在发送前给用户展示提取结果，便于验证质量
- 不改动 LangGraph agent 架构和现有对话逻辑

---

## 2. 关键决策

### 2.1 提取方式

| 文件类型 | 提取方式 |
|---------|---------|
| `.pdf` | `pdfjs-dist` 把每页渲染为图片 → 调用 `qwen-vl-max` 提取文字 |
| `.docx` | `mammoth` 库（ZIP 解析 XML，纯文本提取） |
| `.doc` | `word-extractor` 库（OLE 二进制格式） |

PDF 统一走视觉模型路径，不区分文本层/扫描版。`pdf-parse` 不再使用。

**原因：** 基于字符数的文本层质量判断依赖人为阈值，无法可靠覆盖部分扫描的情况；视觉模型路径对所有 PDF 均有效，逻辑更简单。

### 2.2 上下文注入方式

多个文件的提取结果分别标注文件名，拼接后整体注入 `HumanMessage`，与用户输入的文字分开：

```
【文档1: 周报模板.pdf】
{提取的文字}

【文档2: OKR草稿.docx】
{提取的文字}

{用户输入的文字}
```

每份文档单独截断至 6000 字。LangGraph agent 收到的是普通文本，完全感知不到文件的存在。

### 2.3 处理时机（前端预处理）

文件在发送前由前端预处理，而非在 LangGraph 图内处理。

**原因：**
- PDF 解析是"有文件就必须做"的预处理步骤，不是由 LLM 决定是否调用的推理步骤
- 二进制文件数据无法存入 LangGraph state（state 只存 messages 文本）
- 后端 `/chat` 接口保持纯净，不传输大体积二进制数据

**流程：**
```
用户选择文件（可多个）
    ↓
每个文件独立走 AttachmentAdapter.add()
    ↓
POST /parse-document → extractDocumentText()
    ↓
提取文字存入 attachment metadata，Composer 区域显示预览
    ↓
用户点发送
    ↓
所有附件文字按顺序拼接，注入消息前缀
→ POST /chat → LangGraph agent（看到纯文本）
```

---

## 3. 架构

### 3.1 改动范围

改动仅涉及 4 个文件，LangGraph 相关代码（agents、chat-service、stream-adapter、prompts）一行不动。

```
apps/api/src/
├── services/
│   └── pdf-service.ts          ← 重写：删除 pdf-parse，改为 pdfjs-dist + qwen-vl + mammoth + word-extractor
├── routes/
│   ├── parse-pdf.ts            ← 删除
│   └── parse-document.ts      ← 新建：接受 PDF、DOCX、DOC 三种 MIME 类型
└── index.ts                    ← 路由注册从 /parse-pdf 改为 /parse-document

packages/ui/src/assistant-ui/
└── attachment.tsx              ← 扩展：加文字预览 UI

apps/web/src/client/components/
└── assistant.tsx               ← 扩展：注册 AttachmentAdapter
```

### 3.2 新增 env var

```
QWEN_VL_MODEL_NAME=qwen-vl-max   # 用于 PDF 页图片识别
```

---

## 4. 组件设计

### 4.1 `extractDocumentText(file: File): Promise<string>`

位于 `apps/api/src/services/pdf-service.ts`，单一入口，内部按 MIME 类型分支：

```
DOCX  → mammoth.extractRawText() → 返回文字

DOC   → word-extractor → 返回文字

PDF:
  → pdfjs-dist 把每页渲染为 PNG（base64）
  → 最多处理前 10 页（超过 10 页的文档截断，仅取前 10 页）
  → 调用 qwen-vl-max，发送图片数组（10 页以内一次发送）
  → system prompt: "请提取图片中所有可见文字，按页顺序输出，不要添加解释"
  → 返回文字

最终截断：每份文档最多 6000 字
```

### 4.2 `/parse-document` route

位于 `apps/api/src/routes/parse-document.ts`（新建，替代 `parse-pdf.ts`）。URL 路径从 `/parse-pdf` 改为 `/parse-document`，`index.ts` 同步更新注册。

接受的 MIME 类型：
- `application/pdf`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`（.docx）
- `application/msword`（.doc）

其余文件类型返回 `400 { error: "仅支持 PDF 和 Word 文档（.pdf .docx .doc）" }`。

### 4.3 前端 AttachmentAdapter

位于 `apps/web/src/client/components/assistant.tsx`，注入 `useChatRuntime`：

- `accept`: `"application/pdf,.docx,.doc"` — 限制文件选择器只显示支持的类型
- `add(file)`: 调 `POST /parse-document`，拿到 `{ text }` 后返回包含文字的 attachment 对象；解析进行中 attachment 显示 loading 状态
- `send(attachments)`: 把所有 attachment 的文字按 `【文档N: filename】\n{text}` 格式拼接，附加到消息文本前

多文件：`@assistant-ui` 的 Attachment 系统天然支持多个 attachment，每个独立走 `add()`，发送时统一拼接。

### 4.4 文字预览 UI

位于 `packages/ui/src/assistant-ui/attachment.tsx`，在文档类型 attachment 的缩略图下方增加预览区：

- 默认折叠，显示前 100 字 + "展开"按钮
- 展开后最多显示 500 字，超出可滚动
- 解析中显示骨架屏占位

---

## 5. 错误处理

| 场景 | 处理方式 |
|------|---------|
| 文件类型不支持 | 前端 `accept` 属性过滤；后端返回 400 |
| qwen-vl 调用失败 | attachment 标为错误状态，提示"文档解析失败，请检查文件" |
| 提取文字为空 | 提示"未能从文档中提取到文字" |
| 文件过大（> 10MB） | 后端返回 413，前端提示文件大小限制 |
| 网络超时 | attachment 标为错误状态，允许重试 |

---

## 6. 不在本次范围内

- 图表、表格结构的结构化解析（仅提取纯文字）
- 文件存储持久化（解析结果不入库，仅用于当次对话）
- 其他文件格式（Excel、PowerPoint、TXT 等）
