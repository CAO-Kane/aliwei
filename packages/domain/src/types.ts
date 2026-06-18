export type ToolId = "jargon" | "weekly" | "okr" | "review";

export type Tool = {
  id: ToolId;
  label: string;
  starter: string;
};

export type ThreadMeta = {
  id: string;
  title: string;
  toolId: string | null;
  updatedAt: number;
};
