import { Hono } from "hono";
import {
  getLearnerAnnouncement,
  getUnreadAnnouncementCount,
  listLearnerAnnouncements,
  markAnnouncementRead
} from "../../services/lms.service.js";
import { getPagination, ok, paginated } from "../../lib/response.js";
import type { AppVariables } from "../../types/context.js";

export const announcementRoutes = new Hono<{ Variables: AppVariables }>();

announcementRoutes.get("/", async (c) => {
  const { page, limit } = getPagination(c);
  const result = await listLearnerAnnouncements(c.get("tenant").id, c.get("user").id, page, limit);
  return paginated(c, result.rows, { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
});

announcementRoutes.get("/unread-count", async (c) => {
  return ok(c, await getUnreadAnnouncementCount(c.get("tenant").id, c.get("user").id));
});

announcementRoutes.get("/:id", async (c) => {
  return ok(c, await getLearnerAnnouncement(c.get("tenant").id, c.get("user").id, c.req.param("id")));
});

announcementRoutes.post("/:announcementCourseId/read", async (c) => {
  return ok(c, await markAnnouncementRead(c.get("user").id, c.req.param("announcementCourseId")));
});
