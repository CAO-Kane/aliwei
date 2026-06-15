# Aliwei Agent Team Start Here

本文件是 Aliwei Agent 项目组员的第一入口文档。

请所有成员先阅读本文件，再开始开发。

---

## 1. 项目目标

Aliwei Agent 是一个基于大语言模型的智能工作助手项目。

当前目标不是一次性做完整商业级系统，而是先完成一个结构清晰、可以分工协作、可以逐步迭代的 MVP 工程框架。

核心功能方向包括：

- 阿里味周报助手
- OKR 制定与对齐助手
- 项目复盘助手
- 360 评估辅助
- 阿里黑话翻译器
- 会议效率助手
- 钉钉机器人接入
- Web App 基础页面
- API 服务与 Agent 能力封装

---

## 2. 必读文档顺序

请按以下顺序阅读：

1. docs/Aliwei_Git_Workflow.md
2. docs/Aliwei_Agent_Task_Assignment_with_Prompts.md
3. docs/Aliwei_AI_Continuation_Status_Template.md

作用说明：

- Aliwei_Git_Workflow.md：告诉你怎么拉代码、建分支、提交 PR。
- Aliwei_Agent_Task_Assignment_with_Prompts.md：告诉你负责哪个模块、使用哪个 Prompt、哪些文件可以改。
- Aliwei_AI_Continuation_Status_Template.md：用于每完成一个 Prompt 后生成状态快照，方便下一个 AI 或成员接着做。

---

## 3. 分支规则

本项目采用以下分支结构：

main：稳定分支，只放确认可用的版本。

dev：集成分支，所有功能分支先合并到 dev。

feature/*：每个成员开发自己的功能分支。

禁止直接向 main 提交代码。

推荐流程：

1. 从最新 dev 拉代码。
2. 新建自己的 feature 分支。
3. 完成一个 Prompt。
4. 提交 commit。
5. push 到 GitHub。
6. 创建 Pull Request，base 选择 dev。
7. 等负责人 review 后再 merge。

---

## 4. 成员第一次开发命令

请在自己的电脑上执行：

git clone https://github.com/jenniferzhou0313/aliwei.git

cd aliwei

git checkout dev

git pull origin dev

然后基于自己负责的 Prompt 创建分支，例如：

git checkout -b feature/your-name-prompt-3

---

## 5. 每次开发前必须执行

git checkout dev

git pull origin dev

git checkout -b feature/your-name-prompt-x

如果你已经有自己的功能分支，则先同步 dev，再继续开发。

---

## 6. 每次提交前必须检查

git status

确认没有 .env、token、密钥、无关文件。

提交方式示例：

git add .

git commit -m "feat(agent): add weekly report prompt template"

git push origin feature/your-name-prompt-x

---

## 7. PR 规则

每个 PR 只做一个明确 Prompt。

PR 的 base 分支选择：

dev

PR 的 compare 分支选择：

feature/your-name-prompt-x

PR 描述必须填写清楚：

- 本次实现了什么
- 使用了哪个 Prompt
- 修改了哪些文件
- 如何运行
- 如何测试
- 是否有未完成 TODO

---

## 8. AI 使用规则

可以使用 Claude、Cursor、Codex、ChatGPT 或其他 AI。

但必须遵守：

- 不要让 AI 一次性重写整个项目。
- 不要一次性把所有 Prompt 都发给 AI。
- 只把自己负责的 Prompt 发给 AI。
- 每完成一个 Prompt 就停下来测试、提交、生成状态快照。
- 如果 AI 要改无关文件，必须拒绝。
- 如果 AI 发现文档冲突，先问负责人，不要自行决定。

---

## 9. 当前最重要目标

当前最重要目标是把项目工程化流程跑顺：

项目框架清楚
分支规则清楚
Prompt 分工清楚
PR 审查清楚
每个成员可以独立完成一个 Prompt
任何 AI 都可以从状态快照继续接着做

先追求可控、可合并、可复盘。

不要一开始追求一次性做完所有功能。
