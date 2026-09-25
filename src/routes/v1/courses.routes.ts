import { Hono } from "hono";
import { getCourseLibrary, getLearnerCourse, getLearnerCourses } from "../../services/lms.service.js";
import { ok } from "../../lib/response.js";
import type { AppVariables } from "../../types/context.js";

export const courseRoutes = new Hono<{ Variables: AppVariables }>();

courseRoutes.get("/", async (c) => {
  return ok(c, await getLearnerCourses(c.get("tenant").id, c.get("user").id));
});

courseRoutes.get("/:courseId", async (c) => {
  return ok(c, await getLearnerCourse(c.get("tenant").id, c.get("user").id, c.req.param("courseId")));
});

courseRoutes.get("/:courseId/library", async (c) => {
  return ok(c, await getCourseLibrary(c.get("tenant").id, c.get("user").id, c.req.param("courseId")));
});
