export type AgentId = "jargon" | "weekly" | "okr" | "review" | "start";

export type Agent = {
  id: AgentId;
  label: string;
  starter: string;
};

export type ThreadMeta = {
  id: string;
  title: string;
  agentId: string | null;
  updatedAt: number;
};
