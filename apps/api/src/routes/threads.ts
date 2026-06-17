import { Hono } from "hono";
import { updateThread } from "@aliwei/db";
import { listThreadsForUser, loadMessages, removeThread } from "@/services/thread-service";

const app = new Hono();

app.get("/", (c) => {
  const userId = c.var.userId;
  return c.json(listThreadsForUser(userId));
});

app.get("/:id/messages", (c) => {
  const id = c.req.param("id");
  return c.json(loadMessages(id));
});

app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as { agentId?: string };
  updateThread(id, { agentId: body.agentId });
  return c.json({ ok: true });
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  removeThread(id);
  return c.body(null, 204);
});

export default app;
