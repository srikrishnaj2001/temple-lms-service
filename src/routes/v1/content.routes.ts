import { Hono } from "hono";
import { z } from "zod";
import { ProgressStatus } from "@prisma/client";
import { getContentStream, updateContentProgress } from "../../services/lms.service.js";
import { ok } from "../../lib/response.js";
import type { AppVariables } from "../../types/context.js";

export const contentRoutes = new Hono<{ Variables: AppVariables }>();

const progressSchema = z.object({
  status: z.nativeEnum(ProgressStatus),
  watchedDuration: z.number().int().nonnegative().optional()
});

contentRoutes.get("/:contentId/stream", async (c) => {
  return ok(c, await getContentStream(c.get("user").id, c.req.param("contentId")));
});

contentRoutes.post("/:contentId/progress", async (c) => {
  const body = progressSchema.parse(await c.req.json());
  return ok(c, await updateContentProgress(c.get("user").id, c.req.param("contentId"), body));
});
