import { deleteThread as dbDeleteThread, getMessagesByThread, getThreadsByUser } from "@aliwei/db";

export function listThreadsForUser(userId: string) {
  return getThreadsByUser(userId);
}

export function loadMessages(threadId: string) {
  const rows = getMessagesByThread(threadId);
  return rows.map((r) => JSON.parse(r.content));
}

export function removeThread(threadId: string) {
  dbDeleteThread(threadId);
}
