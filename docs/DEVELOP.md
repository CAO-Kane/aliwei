# Aliwei — 开发者手册

> 给团队成员看的协作手册。AI 协作者请看 [`PROMPT.md`](PROMPT.md)。

---

## 1. 工程基线

pnpm workspace 单仓库，结构见 [`README.md`](../README.md)。端口约定：

| 服务 | 端口 | 启动命令 |
|---|---|---|
| Web (`apps/web`) | 3000 | `pnpm dev:web` |
| API (`apps/api`) | 3001 | `pnpm dev:api` |
| 一起跑 | — | `pnpm dev` |

其他常用脚本：

- `pnpm typecheck` — 所有包并行类型检查
- `pnpm lint` — 所有包并行 oxlint
- `pnpm format:fix` — oxfmt + oxlint --fix
- `pnpm build` — 所有包构建

环境变量从 `apps/api/.env` 和 `apps/web/.env.local` 读取，对应 `.env.example` 在仓库里有模板。

---

## 2. 分支与 PR

```
feature/* → PR → dev → 稳定后 PR → main
```

分支命名：

```
feature/promptXX-short-name
```

例如：`feature/prompt03-domain-standardization`。

PR 流程：

1. 从最新 `dev` 拉分支
2. 改完后跑 `pnpm typecheck` / `pnpm lint` / `pnpm build`
3. 涉及 API 的，`curl http://localhost:3001/health` 验证；涉及 Web 的，开浏览器跑一遍
4. 推分支 + 开 PR，base 是 `dev`
5. 合并后回到 `dev` 拉下一个分支

不要：

- 直接 push 到 `main`
- 在有未提交改动时切分支
- 一个分支塞多个 prompt 的改动

---

## 3. Commit 规范

格式：`type(scope): description`

常用 type：

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `refactor` | 重构（不改功能） |
| `docs` | 文档 |
| `test` | 测试 |
| `chore` | 工程配置 / 依赖 / 脚本 |
| `style` | 格式调整 |

scope 建议：`web` / `api` / `domain` / `db` / `ui` / `dingtalk` / `docs` / `prompt` / `workspace`。

示例：

```
feat(api): add unified chat contract and error handling
refactor(domain): standardize tool prompt contract
docs: add prompt continuation workflow
```

---

## 5. PR 描述模板

```md
## 本次实现
- ...

## 对应 Prompt
- Prompt XX：

## 修改文件
- ...

## 如何运行
pnpm install
pnpm typecheck
pnpm lint
pnpm dev

## 如何测试
- [ ] `curl http://localhost:3001/health` 正常
- [ ] `http://localhost:3000` 能打开
- [ ] 工具切换、对话发送、流式回复、历史线程都正常

## 文档更新
- [ ] `README.md`（如改了工程基线）
- [ ] `docs/PROMPT.md`（如改了 AI 协作规则）
- [ ] `docs/DEVELOP.md`（如改了团队约定）

## 风险和 TODO
- ...

## 人工检查点
- [ ] 没提交 `.env` / key / token
- [ ] 没提交 `node_modules` / `.next` / `local.db`
- [ ] 没重写无关模块
```

---

## 6. 安全 checklist

提交前确认：

- [ ] 没有 `.env` / `local.db` / `*.key` / `*.pem`
- [ ] 没有 `node_modules` / `.next` / `dist` / `build`
- [ ] 没有重写无关模块
- [ ] 跨模块改动在 PR 描述里说明了原因
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm build` 全过
- [ ] 改动了工程基线 / 团队约定的，已同步更新 `README.md` 或 `docs/DEVELOP.md`

冲突了不要乱删，先找技术负责人确认。