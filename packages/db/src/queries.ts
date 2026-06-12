import { desc, eq } from "drizzle-orm";
import { db } from "./client";
import { messages, threads } from "./schema";

export function getThreadsByUser(userId: string) {
  return db
    .select()
    .from(threads)
    .where(eq(threads.userId, userId))
    .orderBy(desc(threads.updatedAt))
    .all();
}

export function getThread(id: string) {
  return db.select().from(threads).where(eq(threads.id, id)).get();
}

export function createThread(params: {
  id: string;
  userId: string;
  title: string;
  toolId?: string | null;
}) {
  const now = Date.now();
  db.insert(threads)
    .values({
      id: params.id,
      userId: params.userId,
      title: params.title,
      toolId: params.toolId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function touchThread(id: string) {
  db.update(threads)
    .set({ updatedAt: Date.now() })
    .where(eq(threads.id, id))
    .run();
}

export function deleteThread(id: string) {
  db.delete(threads).where(eq(threads.id, id)).run();
}

export function getMessagesByThread(threadId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.createdAt)
    .all();
}

export function insertMessage(params: {
  id: string;
  threadId: string;
  role: string;
  content: string;
}) {
  db.insert(messages)
    .values({
      id: params.id,
      threadId: params.threadId,
      role: params.role,
      content: params.content,
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .run();
}
