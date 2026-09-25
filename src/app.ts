import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { prisma } from "./lib/prisma.js";
import { errorHandler } from "./middleware/error-handler.js";
import { v1Routes } from "./routes/v1/index.js";
import { adminRoutes } from "./routes/admin/index.js";
import type { AppVariables } from "./types/context.js";

export function createApp() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.onError(errorHandler);
  app.use("*", logger());
  app.use("*", prettyJSON());
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin || process.env.NODE_ENV !== "production") return origin || "*";
        const allowed = process.env.ALLOWED_ORIGINS?.split(",") ?? [];
        return allowed.includes(origin) ? origin : "";
      },
      credentials: true,
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "user-email",
        "x-request-url",
        "x-tenant-host",
        "x-tenant-id",
        "ngrok-skip-browser-warning"
      ],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    })
  );

  app.get("/health", async (c) => {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: "OK", timestamp: new Date().toISOString(), service: "lms-service" });
  });

  app.route("/v1", v1Routes);
  app.route("/api/admin", adminRoutes);

  app.notFound((c) =>
    c.json(
      {
        success: false,
        error: "NOT_FOUND",
        message: `${c.req.method} ${c.req.path} was not found`
      },
      404
    )
  );

  return app;
}
