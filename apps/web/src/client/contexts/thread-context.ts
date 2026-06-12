"use client";

import { createContext } from "react";
import type { ThreadMeta, Tool } from "@aliwei/domain/types";

export type ThreadContextValue = {
  threads: ThreadMeta[];
  activeThreadId: string;
  activeTool: Tool | null;
  newThread: (tool?: Tool) => void;
  switchToThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
};

export const ThreadContext = createContext<ThreadContextValue>({
  threads: [],
  activeThreadId: "",
  activeTool: null,
  newThread: () => {},
  switchToThread: () => {},
  deleteThread: () => {},
});
