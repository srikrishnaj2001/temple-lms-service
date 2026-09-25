import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

type Pagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ success: true, data }, status);
}

export function paginated<T>(c: Context, data: T, pagination: Pagination) {
  return c.json({ success: true, data, pagination });
}

export function getPagination(c: Context) {
  const page = Math.max(Number(c.req.query("page") ?? 1), 1);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 20), 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
