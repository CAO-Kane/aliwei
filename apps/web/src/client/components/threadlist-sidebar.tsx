"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@aliwei/ui/primitives/sidebar";
import { cn } from "@aliwei/ui/cn";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useContext, type FC } from "react";
import { ThreadContext } from "@/client/contexts/thread-context";

export const ThreadListSidebar: FC = () => {
  const { threads, activeThreadId, newThread, switchToThread, deleteThread } =
    useContext(ThreadContext);
  const { setOpenMobile } = useSidebar();

  const handleNew = () => {
    newThread();
    setOpenMobile(false);
  };

  const handleSwitch = (id: string) => {
    switchToThread(id);
    setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-3">
        <button
          onClick={handleNew}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <PlusIcon className="size-4 shrink-0" />
          新对话
        </button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-2">
          <SidebarGroupContent>
            <SidebarMenu>
              {threads.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  暂无对话历史
                </p>
              ) : (
                threads.map((t) => (
                  <SidebarMenuItem key={t.id}>
                    <div
                      className={cn(
                        "group flex h-9 cursor-pointer items-center gap-1 rounded-md px-3 text-sm transition-colors",
                        t.id === activeThreadId
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      onClick={() => handleSwitch(t.id)}
                    >
                      <span className="flex-1 truncate">{t.title}</span>
                      <button
                        className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteThread(t.id);
                        }}
                        aria-label="删除对话"
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </div>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};
