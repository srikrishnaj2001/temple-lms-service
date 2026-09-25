import { Hono } from "hono";
import { getLearningJourney } from "../../services/lms.service.js";
import { ok } from "../../lib/response.js";
import type { AppVariables } from "../../types/context.js";

export const progressRoutes = new Hono<{ Variables: AppVariables }>();

progressRoutes.get("/journey", async (c) => ok(c, await getLearningJourney(c.get("user").id)));
