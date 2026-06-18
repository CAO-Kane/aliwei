import type { Agent } from "./types";

export const AGENTS: Agent[] = [
  {
    id: "jargon",
    label: "黑话翻译器",
    starter:
      "我来帮你翻译阿里黑话！你可以：\n\n1. 直接粘贴一段含黑话的文字，我帮你翻译成正常话\n2. 告诉我你想「加点阿里味」，我帮你把普通表达升级\n3. 上传 PDF 文件，我帮你翻译全文\n\n请把需要翻译的内容发给我吧。",
  },
  {
    id: "weekly",
    label: "周报助手",
    starter:
      "我来帮你写周报！请告诉我：\n\n**本周你主要做了哪些事情？**\n（随意描述就好，不用整理，我来帮你归纳）",
  },
  {
    id: "okr",
    label: "OKR 助手",
    starter:
      "我是你的 OKR 助手，可以帮你：\n\n📝 **写 OKR** — 从零开始，引导你写出清晰的 OKR\n⭐ **评估 OKR** — 给你的 OKR 打分，提出改进建议\n📊 **追踪进展** — 更新每周进展，生成状态报告\n📋 **季度总结** — 基于进展记录，生成完成情况报告\n\n你想做哪个？",
  },
  {
    id: "review",
    label: "复盘助手",
    starter:
      "我来帮你做项目复盘！\n\n你想用哪个框架？\n- **STAR 框架** — 适合复盘一个具体项目或事件\n- **PDCA 框架** — 适合持续改进型的周期性复盘",
  },
];

export function findAgent(agentId: string | null | undefined): Agent | null {
  if (!agentId) return null;
  return AGENTS.find((a) => a.id === agentId) ?? null;
}
