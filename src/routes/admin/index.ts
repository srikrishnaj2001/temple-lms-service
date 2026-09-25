import { Hono } from "hono";
import { z } from "zod";
import { ContentType } from "@prisma/client";
import { requireAdmin } from "../../middleware/admin.js";
import { requireUser } from "../../middleware/auth.js";
import { resolveTenant } from "../../middleware/tenant.js";
import { getPagination, ok, paginated } from "../../lib/response.js";
import type { AppVariables } from "../../types/context.js";
import {
  bulkEnroll,
  cloneCourse,
  createAnnouncement,
  createContent,
  createCourse,
  createEnrollment,
  createModule,
  createRole,
  createTenant,
  createUser,
  deleteAnnouncement,
  deleteContent,
  deleteCourse,
  deleteEnrollment,
  deleteModule,
  deleteRole,
  deleteUser,
  getAdminAnnouncement,
  getAdminCourse,
  getAnnouncementPinContext,
  getContent,
  getCourseProgress,
  getModule,
  getRole,
  getTenant,
  getUser,
  getUserProgress,
  getUserRoles,
  listAdminAnnouncements,
  listAdminCourses,
  listContents,
  listCourseEnrollments,
  listEnrollments,
  listModules,
  listRoles,
  listTenants,
  listUsers,
  registerUpload,
  reorderContents,
  reorderModules,
  replaceCourseRoles,
  replaceUserRoles,
  updateAnnouncement,
  updateAnnouncementPins,
  updateContent,
  updateCourse,
  updateModule,
  updateRole,
  updateTenant,
  updateUser
} from "../../services/lms.service.js";

export const adminRoutes = new Hono<{ Variables: AppVariables }>();

adminRoutes.use("*", resolveTenant, requireUser, requireAdmin);

const idListSchema = z.object({ roleIds: z.array(z.string().uuid()).default([]) });
const reorderModulesSchema = z.object({ moduleIds: z.array(z.string().uuid()) });
const reorderContentsSchema = z.object({ contentIds: z.array(z.string().uuid()) });

adminRoutes.get("/tenants", async (c) => {
  const { page, limit } = getPagination(c);
  const result = await listTenants(page, limit);
  return paginated(c, result.rows, { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
});
adminRoutes.get("/tenants/:id", async (c) => ok(c, await getTenant(c.req.param("id"))));
adminRoutes.post("/tenants", async (c) => ok(c, await createTenant(await c.req.json()), 201));
adminRoutes.put("/tenants/:id", async (c) => ok(c, await updateTenant(c.req.param("id"), await c.req.json())));

adminRoutes.get("/roles", async (c) => {
  const { page, limit } = getPagination(c);
  const result = await listRoles(page, limit);
  return paginated(c, result.rows, { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
});
adminRoutes.get("/roles/:id", async (c) => ok(c, await getRole(c.req.param("id"))));
adminRoutes.post("/roles", async (c) => ok(c, await createRole(await c.req.json()), 201));
adminRoutes.put("/roles/:id", async (c) => ok(c, await updateRole(c.req.param("id"), await c.req.json())));
adminRoutes.delete("/roles/:id", async (c) => ok(c, await deleteRole(c.req.param("id"))));

adminRoutes.get("/courses", async (c) => {
  const { page, limit } = getPagination(c);
  const result = await listAdminCourses(page, limit, c.req.query("tenantId"));
  return paginated(c, result.rows, { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
});
adminRoutes.post("/courses", async (c) => ok(c, await createCourse(await c.req.json()), 201));
adminRoutes.get("/courses/:id", async (c) => ok(c, await getAdminCourse(c.req.param("id"))));
adminRoutes.put("/courses/:id", async (c) => ok(c, await updateCourse(c.req.param("id"), await c.req.json())));
adminRoutes.delete("/courses/:id", async (c) => ok(c, await deleteCourse(c.req.param("id"))));
adminRoutes.post("/courses/:id/clone", async (c) => {
  const body = z.object({ tenantId: z.string().uuid() }).parse(await c.req.json());
  return ok(c, await cloneCourse(c.req.param("id"), body.tenantId), 201);
});
adminRoutes.get("/courses/:id/roles", async (c) => ok(c, (await getAdminCourse(c.req.param("id"))).roles));
adminRoutes.put("/courses/:id/roles", async (c) => {
  const body = idListSchema.parse(await c.req.json());
  return ok(c, await replaceCourseRoles(c.req.param("id"), body.roleIds));
});

adminRoutes.get("/courses/:courseId/modules", async (c) => ok(c, await listModules(c.req.param("courseId"))));
adminRoutes.get("/modules/:id", async (c) => ok(c, await getModule(c.req.param("id"))));
adminRoutes.post("/modules", async (c) => ok(c, await createModule(await c.req.json()), 201));
adminRoutes.put("/modules/:id", async (c) => ok(c, await updateModule(c.req.param("id"), await c.req.json())));
adminRoutes.delete("/modules/:id", async (c) => ok(c, await deleteModule(c.req.param("id"))));
adminRoutes.patch("/courses/:courseId/modules/reorder", async (c) => {
  const body = reorderModulesSchema.parse(await c.req.json());
  return ok(c, await reorderModules(c.req.param("courseId"), body.moduleIds));
});

adminRoutes.get("/modules/:moduleId/contents", async (c) => ok(c, await listContents(c.req.param("moduleId"))));
adminRoutes.get("/contents/:id", async (c) => ok(c, await getContent(c.req.param("id"))));
adminRoutes.post("/contents", async (c) => {
  const body = z.object({ type: z.nativeEnum(ContentType) }).passthrough().parse(await c.req.json());
  return ok(c, await createContent(body), 201);
});
adminRoutes.put("/contents/:id", async (c) => ok(c, await updateContent(c.req.param("id"), await c.req.json())));
adminRoutes.delete("/contents/:id", async (c) => ok(c, await deleteContent(c.req.param("id"))));
adminRoutes.patch("/modules/:moduleId/contents/reorder", async (c) => {
  const body = reorderContentsSchema.parse(await c.req.json());
  return ok(c, await reorderContents(c.req.param("moduleId"), body.contentIds));
});

adminRoutes.get("/users", async (c) => {
  const { page, limit } = getPagination(c);
  const result = await listUsers(page, limit, c.req.query("roleId"));
  return paginated(c, result.rows, { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
});
adminRoutes.get("/users/:id", async (c) => ok(c, await getUser(c.req.param("id"))));
adminRoutes.post("/users", async (c) => ok(c, await createUser(await c.req.json()), 201));
adminRoutes.put("/users/:id", async (c) => ok(c, await updateUser(c.req.param("id"), await c.req.json())));
adminRoutes.delete("/users/:id", async (c) => ok(c, await deleteUser(c.req.param("id"))));
adminRoutes.get("/users/:id/roles", async (c) => ok(c, await getUserRoles(c.req.param("id"))));
adminRoutes.put("/users/:id/roles", async (c) => {
  const body = idListSchema.parse(await c.req.json());
  return ok(c, await replaceUserRoles(c.req.param("id"), body.roleIds));
});

adminRoutes.get("/enrollments", async (c) => {
  const { page, limit } = getPagination(c);
  const result = await listEnrollments(page, limit);
  return paginated(c, result.rows, { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
});
adminRoutes.get("/courses/:courseId/enrollments", async (c) => ok(c, await listCourseEnrollments(c.req.param("courseId"))));
adminRoutes.post("/enrollments", async (c) => ok(c, await createEnrollment(await c.req.json()), 201));
adminRoutes.post("/enrollments/bulk", async (c) => {
  const body = z.object({ courseId: z.string().uuid(), users: z.array(z.object({ email: z.string().email(), name: z.string(), phone: z.string().optional() })) }).parse(await c.req.json());
  return ok(c, await bulkEnroll(body.courseId, body.users), 201);
});
adminRoutes.delete("/enrollments/:id", async (c) => ok(c, await deleteEnrollment(c.req.param("id"))));

adminRoutes.get("/courses/:courseId/progress", async (c) => ok(c, await getCourseProgress(c.req.param("courseId"))));
adminRoutes.get("/users/:userId/progress", async (c) => ok(c, await getUserProgress(c.req.param("userId"))));

adminRoutes.get("/announcements", async (c) => {
  const { page, limit } = getPagination(c);
  const result = await listAdminAnnouncements(page, limit, c.req.query("tenantId"));
  return paginated(c, result.rows, { total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
});
adminRoutes.post("/announcements", async (c) => ok(c, await createAnnouncement({ ...(await c.req.json()), authorId: c.get("user").id }), 201));
adminRoutes.get("/announcements/:id", async (c) => ok(c, await getAdminAnnouncement(c.req.param("id"))));
adminRoutes.patch("/announcements/:id", async (c) => ok(c, await updateAnnouncement(c.req.param("id"), await c.req.json())));
adminRoutes.delete("/announcements/:id", async (c) => ok(c, await deleteAnnouncement(c.req.param("id"))));
adminRoutes.get("/announcements/:id/pin-context", async (c) => ok(c, await getAnnouncementPinContext(c.req.param("id"))));
adminRoutes.patch("/announcements/:id/pins", async (c) => {
  const body = z.object({ courseIds: z.array(z.string().uuid()), pinnedCourseIds: z.array(z.string().uuid()).default([]) }).parse(await c.req.json());
  return ok(c, await updateAnnouncementPins(c.req.param("id"), body.courseIds, body.pinnedCourseIds));
});

adminRoutes.post("/uploads/:kind", async (c) => {
  const body = z.object({ fileName: z.string().min(1) }).parse(await c.req.json());
  return ok(c, await registerUpload(c.req.param("kind"), body.fileName), 201);
});
