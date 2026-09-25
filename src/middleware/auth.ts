import { createMiddleware } from "hono/factory";
import { prisma } from "../lib/prisma.js";
import { UnauthorizedError } from "../lib/errors.js";
import type { AppVariables } from "../types/context.js";

export const requireUser = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const email =
    c.req.header("user-email") ??
    (process.env.NODE_ENV === "development" ? process.env.DEFAULT_USER_EMAIL ?? "learner@example.com" : undefined);

  if (!email) {
    throw new UnauthorizedError("Missing user-email header");
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { roles: { include: { role: true } } }
  });

  if (!user) {
    throw new UnauthorizedError(`No LMS user found for ${email}`);
  }

  c.set("user", user);
  await next();
});
