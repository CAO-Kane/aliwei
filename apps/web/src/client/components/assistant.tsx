"use client";

import {
  AssistantRuntimeProvider,
  useAssistantInstructions,
  useAuiState,
} from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { Thread } from "@aliwei/ui/assistant-ui/thread";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@aliwei/ui/primitives/sidebar";
import { Separator } from "@aliwei/ui/primitives/separator";
import { cn } from "@aliwei/ui/cn";
import type { Tool, ThreadMeta } from "@aliwei/domain/types";
import { TOOLS, findTool } from "@aliwei/domain/tools";
import { ThreadContext } from "@/client/contexts/thread-context";
import { ThreadListSidebar } from "@/client/components/threadlist-sidebar";
import { apiFetch, apiUrl } from "@/client/lib/api";
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FC,
} from "react";

function InstructionsInjector({ systemPrompt }: { systemPrompt: string }) {
  useAssistantInstructions(systemPrompt);
  return null;
}

function ThreadCompletionDetector({ onComplete }: { onComplete: () => void }) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const prevRef = useRef(false);

  useEffect(() => {
    if (prevRef.current && !isRunning) {
      onComplete();
    }
    prevRef.current = isRunning;
  }, [isRunning, onComplete]);

  return null;
}

const ToolWelcome: FC = () => {
  const { activeTool } = useContext(ThreadContext);

  if (!activeTool) {
    return (
      <div className="flex flex-col items-center gap-2 text-center px-4">
        <h1 className="text-2xl font-semibold">阿里职场 AI 助手</h1>
        <p className="text-sm text-muted-foreground">
          周报、OKR、复盘、黑话翻译 — 一个对话搞定
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center px-4 max-w-xl">
      <div className="text-4xl">{activeTool.icon}</div>
      <h2 className="text-xl font-semibold">{activeTool.label}</h2>
      <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
        {activeTool.starter}
      </p>
    </div>
  );
};

function ToolButtons() {
  const { activeTool, newThread } = useContext(ThreadContext);

  return (
    <div className="grid grid-cols-2 gap-2 w-full max-w-md mx-auto">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => newThread(tool)}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3",
            "text-sm font-medium text-left transition-colors",
            activeTool?.id === tool.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <span className="text-lg">{tool.icon}</span>
          <span>{tool.label}</span>
        </button>
      ))}
    </div>
  );
}

type ChatViewProps = {
  threadId: string;
  initialMessages: UIMessage[];
  activeTool: Tool | null;
  onMessagesChanged: () => void;
};

function ChatView({
  threadId,
  initialMessages,
  activeTool,
  onMessagesChanged,
}: ChatViewProps) {
  const runtime = useChatRuntime({
    messages: initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: apiUrl("/chat"),
      credentials: "include",
      body: { threadId, toolId: activeTool?.id ?? null },
    }),
  });

  const stableOnMessagesChanged = useCallback(
    () => onMessagesChanged(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <InstructionsInjector systemPrompt={activeTool?.systemPrompt ?? ""} />
      <ThreadCompletionDetector onComplete={stableOnMessagesChanged} />
      <Thread components={{ Welcome: ToolWelcome }} />
    </AssistantRuntimeProvider>
  );
}

type ThreadState = {
  id: string;
  messages: UIMessage[];
};

export const Assistant: FC = () => {
  const [thread, setThread] = useState<ThreadState>(() => ({
    id: crypto.randomUUID(),
    messages: [],
  }));
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [threads, setThreads] = useState<ThreadMeta[]>([]);

  const refreshThreads = useCallback(async () => {
    try {
      const res = await apiFetch("/threads");
      if (res.ok) setThreads(await res.json());
    } catch {
      // ignore network errors — stale list is fine
    }
  }, []);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  const newThread = useCallback((tool?: Tool) => {
    setThread({ id: crypto.randomUUID(), messages: [] });
    setActiveTool(tool ?? null);
  }, []);

  const switchToThread = useCallback(
    async (threadId: string) => {
      const res = await apiFetch(`/threads/${threadId}/messages`);
      const msgs: UIMessage[] = res.ok ? await res.json() : [];
      setThread({ id: threadId, messages: msgs });

      const meta = threads.find((t) => t.id === threadId);
      setActiveTool(findTool(meta?.toolId));
    },
    [threads],
  );

  const deleteThread = useCallback(
    async (threadId: string) => {
      await apiFetch(`/threads/${threadId}`, { method: "DELETE" });
      if (threadId === thread.id) newThread();
      await refreshThreads();
    },
    [thread.id, newThread, refreshThreads],
  );

  const contextValue = {
    threads,
    activeThreadId: thread.id,
    activeTool,
    newThread,
    switchToThread,
    deleteThread,
  };

  return (
    <ThreadContext.Provider value={contextValue}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <ThreadListSidebar />
          <SidebarInset>
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator
                orientation="vertical"
                className="border-border mr-2 h-4"
              />
              <span className="text-sm font-medium text-muted-foreground">
                阿里职场 AI 助手
              </span>
            </header>
            <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
              <div className="flex flex-col items-center gap-4 pt-10 pb-4 px-4 shrink-0">
                <ToolButtons />
              </div>
              <Separator />
              <div className="flex-1 overflow-hidden">
                <ChatView
                  key={thread.id}
                  threadId={thread.id}
                  initialMessages={thread.messages}
                  activeTool={activeTool}
                  onMessagesChanged={refreshThreads}
                />
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ThreadContext.Provider>
  );
};
