import { Hono } from "hono";
import { requireUser } from "../../middleware/auth.js";
import { resolveTenant } from "../../middleware/tenant.js";
import { meRoutes } from "./me.routes.js";
import { courseRoutes } from "./courses.routes.js";
import { contentRoutes } from "./content.routes.js";
import { progressRoutes } from "./progress.routes.js";
import { announcementRoutes } from "./announcements.routes.js";
import type { AppVariables } from "../../types/context.js";

export const v1Routes = new Hono<{ Variables: AppVariables }>();

v1Routes.use("*", resolveTenant, requireUser);
v1Routes.route("/me", meRoutes);
v1Routes.route("/courses", courseRoutes);
v1Routes.route("/content", contentRoutes);
v1Routes.route("/progress", progressRoutes);
v1Routes.route("/announcements", announcementRoutes);
