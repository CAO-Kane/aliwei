import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { guestIdMiddleware } from "@/middleware/guest-id";
import chat from "@/routes/chat";
import threads from "@/routes/threads";
import parsePdf from "@/routes/parse-pdf";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    // credentials:true means the browser will only send cookies if origin
    // matches EXACTLY — wildcard "*" is rejected. Single origin in dev,
    // configure WEB_ORIGIN per environment in prod.
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);
app.use("*", guestIdMiddleware);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/chat", chat);
app.route("/threads", threads);
app.route("/parse-pdf", parsePdf);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, ({ port: actualPort }) => {
  console.log(`api listening on http://localhost:${actualPort}`);
});
