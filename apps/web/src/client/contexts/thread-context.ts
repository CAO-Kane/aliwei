"use client";

import { createContext } from "react";
import type { ThreadMeta, Agent } from "@aliwei/domain/types";

export type ThreadContextValue = {
  threads: ThreadMeta[];
  activeThreadId: string;
  activeAgent: Agent | null;
  newThread: (agent?: Agent) => void;
  switchToThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  requestAgentSwitch: (agent: Agent, message: string) => void;
};

export const ThreadContext = createContext<ThreadContextValue>({
  threads: [],
  activeThreadId: "",
  activeAgent: null,
  newThread: () => {},
  switchToThread: () => {},
  deleteThread: () => {},
  requestAgentSwitch: () => {},
});
