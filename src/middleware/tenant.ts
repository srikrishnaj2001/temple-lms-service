import { createMiddleware } from "hono/factory";
import { prisma } from "../lib/prisma.js";
import { NotFoundError } from "../lib/errors.js";
import type { AppVariables } from "../types/context.js";

function normalizeHost(value?: string | null) {
  if (!value) return undefined;
  try {
    if (value.startsWith("http")) {
      value = new URL(value).host;
    }
  } catch {
    return undefined;
  }

  return value
    .split(",")[0]
    ?.trim()
    .replace(/^admin\./, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
}

export const resolveTenant = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const explicitTenantId = c.req.header("x-tenant-id");
  const host =
    normalizeHost(c.req.header("x-tenant-host")) ??
    normalizeHost(c.req.header("x-request-url")) ??
    normalizeHost(c.req.header("host"));

  const tenant = explicitTenantId
    ? await prisma.tenant.findUnique({ where: { id: explicitTenantId } })
    : host
      ? await prisma.tenant.findUnique({ where: { domain: host } })
      : null;

  const fallbackTenant =
    tenant ??
    (process.env.NODE_ENV === "development"
      ? await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } })
      : null);

  if (!fallbackTenant) {
    throw new NotFoundError(host ? `No tenant found for ${host}` : "No tenant could be resolved");
  }

  c.set("tenant", fallbackTenant);
  await next();
});
