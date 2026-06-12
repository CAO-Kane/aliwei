export type JargonEntry = {
  word: string;
  meaning: string;
  scene: string;
  correct: string;
  wrong: string;
  category: string;
};

export const JARGON_DICT: JargonEntry[] = [
  {
    word: "拉通",
    meaning: "把相关人拉到一起，沟通对齐信息",
    scene: "跨团队合作启动、重要项目推进前",
    correct: "上线前我们需要拉通产研运三个团队，确保信息一致。",
    wrong: "拉通一下今天午饭吃什么。",
    category: "沟通协作类",
  },
  {
    word: "对齐",
    meaning: "确认双方理解一致、目标一致",
    scene: "会议开始、方案确认、跨部门合作",
    correct: "我们先对齐一下这次项目的目标和边界。",
    wrong: "我们对齐一下谁来买单。",
    category: "沟通协作类",
  },
  {
    word: "抓手",
    meaning: "可以切入执行、推动结果的具体着力点",
    scene: "策略讨论、方案设计时描述执行路径",
    correct: "这个方向很好，但抓手还不够清晰，要找到可量化的切入点。",
    wrong: "这个抓手太难握了。",
    category: "管理思维类",
  },
  {
    word: "闭环",
    meaning: "把一件事从头做到尾、有始有终、有结果反馈",
    scene: "任务跟进、问题处理、项目收尾",
    correct: "这个问题我会跟进闭环，下周五给你结果。",
    wrong: "我们把这个闭环一下（无具体事项）。",
    category: "执行行动类",
  },
  {
    word: "赋能",
    meaning: "给某人或团队提供资源、能力或支持，使其更有效地工作",
    scene: "培训、支持、协作",
    correct: "这次培训是为了赋能一线销售团队，让他们能独立完成方案演示。",
    wrong: "你来赋能一下我（无具体内容）。",
    category: "管理思维类",
  },
  {
    word: "颗粒度",
    meaning: "细化程度、精细程度",
    scene: "讨论方案细化程度、数据分析层级",
    correct: "这份报告颗粒度太粗，需要细化到每个城市的数据。",
    wrong: "我想吃颗粒度细一点的米饭。",
    category: "分析复盘类",
  },
  {
    word: "打通",
    meaning: "消除障碍，使流程/系统/团队之间能顺畅流转",
    scene: "系统集成、流程优化、组织协作",
    correct: "我们需要把线上线下的数据打通，实现统一分析。",
    wrong: "把这堵墙打通（物理层面的拆除）。",
    category: "执行行动类",
  },
  {
    word: "沉淀",
    meaning: "将经验、知识、流程整理固化下来，形成可复用资产",
    scene: "项目复盘、知识管理、经验总结",
    correct: "这次项目结束后要把方法论沉淀下来，形成SOP。",
    wrong: "咖啡里有沉淀物。",
    category: "分析复盘类",
  },
  {
    word: "横向拉齐",
    meaning: "与同级别的其他团队沟通对齐，确保方向一致",
    scene: "并行团队协作、需要多方同步时",
    correct: "方案定稿前需要横向拉齐市场和法务的意见。",
    wrong: "把桌子横向拉齐。",
    category: "沟通协作类",
  },
  {
    word: "向上管理",
    meaning: "主动管理与上级的沟通和预期，确保上级知情并支持",
    scene: "汇报工作、争取资源、风险预警",
    correct: "这件事要提前做好向上管理，让老板知道项目的风险。",
    wrong: "我要向上管理我的老板（暗示控制上级）。",
    category: "管理思维类",
  },
  {
    word: "端到端",
    meaning: "从起点到终点全链路负责，不留盲区",
    scene: "描述责任范围、流程设计",
    correct: "产品经理需要端到端负责用户从注册到首次下单的整个体验。",
    wrong: "这个问题端到端很复杂（无具体主语）。",
    category: "项目管理类",
  },
  {
    word: "MVP",
    meaning: "Minimum Viable Product，最小可行产品，用最少功能验证核心假设",
    scene: "新产品/功能立项、资源有限时优先级决策",
    correct: "先做MVP跑通核心流程，验证用户愿意付费后再做完整版。",
    wrong: "我们的MVP必须包含所有功能（与含义矛盾）。",
    category: "业务增长类",
  },
  {
    word: "ROI",
    meaning: "Return on Investment，投资回报率，评估资源投入是否值得",
    scene: "项目立项、资源申请、方案评估",
    correct: "这个方案人力成本高但预期收益低，ROI不划算，建议缩减范围。",
    wrong: "ROI很好（无具体数据支撑）。",
    category: "业务增长类",
  },
  {
    word: "复盘",
    meaning: "事后回顾总结，分析做对了什么、做错了什么、下次怎么改进",
    scene: "项目结束、季度/年度总结",
    correct: "大促结束后我们需要做一次完整复盘，把问题和经验都沉淀下来。",
    wrong: "我们复盘一下午饭去哪里吃。",
    category: "分析复盘类",
  },
  {
    word: "灰度",
    meaning: "灰度发布，先向一部分用户开放新功能，验证后再全量",
    scene: "产品发布、功能上线",
    correct: "新版本先灰度10%的用户，观察崩溃率和转化率再决定是否全量。",
    wrong: "这张图片颜色太灰度了。",
    category: "项目管理类",
  },
  {
    word: "全量",
    meaning: "向所有用户/数据范围开放，与灰度相对",
    scene: "产品发布、数据处理",
    correct: "灰度验证没问题，可以全量上线了。",
    wrong: "我全量购买了这批货。",
    category: "项目管理类",
  },
  {
    word: "北极星指标",
    meaning: "团队最核心的一个衡量成功的指标，所有工作围绕它优化",
    scene: "产品策略讨论、OKR制定",
    correct: "我们的北极星指标是月活跃用户数，其他指标都服务于它。",
    wrong: "我们有五个北极星指标（北极星只能有一个）。",
    category: "业务增长类",
  },
  {
    word: "心智",
    meaning: "用户对品牌/产品的认知和印象",
    scene: "品牌建设、市场推广",
    correct: "我们要在用户心智中占据「年轻人的第一台相机」这个位置。",
    wrong: "用户的心智很复杂（泛指思维，非营销语境）。",
    category: "业务增长类",
  },
  {
    word: "体感",
    meaning: "主观感受和直觉判断，相对于数据的感性认知",
    scene: "描述用户体验、非数据支撑的判断",
    correct: "数据上没什么变化，但用户体感上这个版本明显更流畅。",
    wrong: "天气体感温度很低（气象语境正确，职场中勿滥用）。",
    category: "分析复盘类",
  },
  {
    word: "拆解",
    meaning: "将大目标或复杂问题分解成更小的、可执行的部分",
    scene: "OKR制定、项目规划、问题分析",
    correct: "把这个季度的GMV目标拆解到每个渠道和每周，逐步跟进。",
    wrong: "把这台机器拆解（物理拆卸，非职场黑话）。",
    category: "执行行动类",
  },
];

export function formatDictForPrompt(dict: JargonEntry[]): string {
  return dict
    .map(
      (e) =>
        `【${e.word}】${e.meaning}。场景：${e.scene}。✓例：${e.correct} ✗忌：${e.wrong}`,
    )
    .join("\n");
}
