import { Hono } from "hono";
import { z } from "zod";
import { getMe, updateMe } from "../../services/lms.service.js";
import { ok } from "../../lib/response.js";
import type { AppVariables } from "../../types/context.js";

export const meRoutes = new Hono<{ Variables: AppVariables }>();

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  imageUrl: z.string().url().optional()
});

meRoutes.get("/", async (c) => ok(c, await getMe(c.get("user").id)));

meRoutes.patch("/", async (c) => {
  const body = profileSchema.parse(await c.req.json());
  return ok(c, await updateMe(c.get("user").id, body));
});
