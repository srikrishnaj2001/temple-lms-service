import { createMiddleware } from "hono/factory";
import { ForbiddenError } from "../lib/errors.js";
import type { AppVariables } from "../types/context.js";

export const requireAdmin = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const user = c.get("user");
  const isAdmin = user.roles.some((userRole) => userRole.role.name.toLowerCase() === "admin");
  if (!isAdmin) {
    throw new ForbiddenError("Admin role required");
  }
  await next();
});
