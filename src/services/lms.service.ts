import { ContentType, ProgressStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { getStreamUrl } from "../lib/gumlet.js";

const contentInclude = {
  video: true,
  audio: true,
  document: true,
  richText: true,
  image: true,
  progress: true
} satisfies Prisma.ContentInclude;

const moduleInclude = {
  contents: {
    orderBy: { sequenceNumber: "asc" as const },
    include: contentInclude
  }
};

function roleNames(input: { role: { name: string } }[]) {
  return input.map((item) => item.role.name);
}

function isModuleComplete(module: { contents: { progress: { status: ProgressStatus }[] }[] }) {
  if (module.contents.length === 0) return false;
  return module.contents.every((content) => content.progress.some((progress) => progress.status === ProgressStatus.COMPLETED));
}

function decorateModules<T extends { startsAt: Date | null; contents: { progress: { status: ProgressStatus }[] }[] }>(modules: T[]) {
  let previousComplete = true;
  return modules.map((module) => {
    const timeLocked = Boolean(module.startsAt && module.startsAt > new Date());
    const sequenceLocked = !previousComplete;
    const complete = isModuleComplete(module);
    previousComplete = complete;
    return {
      ...module,
      isLocked: timeLocked || sequenceLocked,
      lockReason: timeLocked ? "Scheduled for later" : sequenceLocked ? "Complete the previous module first" : null,
      isComplete: complete
    };
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } }
  });
  if (!user) throw new NotFoundError("User not found");
  return { ...user, roleNames: roleNames(user.roles) };
}

export async function updateMe(userId: string, data: { name?: string; phone?: string; imageUrl?: string }) {
  return prisma.user.update({ where: { id: userId }, data });
}

export async function getLearnerCourses(tenantId: string, userId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, course: { tenantId } },
    include: {
      course: {
        include: {
          roles: { include: { role: true } },
          modules: { include: { contents: { include: { progress: { where: { enrollment: { userId } } } } } } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return enrollments.map((enrollment) => {
    const contents = enrollment.course.modules.flatMap((module) => module.contents);
    const completeCount = contents.filter((content) =>
      content.progress.some((progress) => progress.status === ProgressStatus.COMPLETED)
    ).length;
    return {
      ...enrollment.course,
      enrollmentId: enrollment.id,
      roleNames: roleNames(enrollment.course.roles),
      contentCount: contents.length,
      completeCount,
      progressPercent: contents.length ? Math.round((completeCount / contents.length) * 100) : 0
    };
  });
}

export async function getLearnerCourse(tenantId: string, userId: string, courseId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: {
      course: {
        include: {
          roles: { include: { role: true } },
          modules: {
            orderBy: { sequenceNumber: "asc" },
            include: {
              contents: {
                orderBy: { sequenceNumber: "asc" },
                include: { progress: { where: { enrollment: { userId } } } }
              }
            }
          }
        }
      }
    }
  });

  if (!enrollment || enrollment.course.tenantId !== tenantId) {
    throw new NotFoundError("Course not found for this learner");
  }

  return {
    ...enrollment.course,
    enrollmentId: enrollment.id,
    roleNames: roleNames(enrollment.course.roles),
    modules: decorateModules(enrollment.course.modules)
  };
}

export async function getCourseLibrary(tenantId: string, userId: string, courseId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: {
      course: {
        include: {
          modules: {
            orderBy: { sequenceNumber: "asc" },
            include: {
              contents: {
                orderBy: { sequenceNumber: "asc" },
                include: {
                  video: true,
                  audio: true,
                  document: true,
                  richText: true,
                  image: true,
                  progress: { where: { enrollment: { userId } } }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!enrollment || enrollment.course.tenantId !== tenantId) {
    throw new NotFoundError("Course library not found");
  }

  return {
    ...enrollment.course,
    enrollmentId: enrollment.id,
    modules: decorateModules(enrollment.course.modules)
  };
}

export async function getContentStream(userId: string, contentId: string) {
  const content = await prisma.content.findFirst({
    where: { id: contentId, module: { course: { enrollments: { some: { userId } } } } },
    include: { video: true, audio: true, module: { include: { course: true } } }
  });

  if (!content) throw new NotFoundError("Content not found");

  if (content.type === ContentType.VIDEO && content.video) {
    return getStreamUrl(content.video.externalVideoId);
  }
  if (content.type === ContentType.AUDIO && content.audio) {
    return { streamUrl: content.audio.url, provider: "audio", mode: "direct" };
  }

  throw new BadRequestError("Only video and audio content has stream URLs");
}

export async function updateContentProgress(
  userId: string,
  contentId: string,
  data: { status: ProgressStatus; watchedDuration?: number }
) {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    include: { module: { include: { course: true } } }
  });
  if (!content) throw new NotFoundError("Content not found");

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: content.module.courseId } }
  });
  if (!enrollment) throw new ForbiddenError("You are not enrolled in this course");

  return prisma.contentProgress.upsert({
    where: { enrollmentId_contentId: { enrollmentId: enrollment.id, contentId } },
    update: {
      status: data.status,
      watchedDuration: data.watchedDuration,
      completedAt: data.status === ProgressStatus.COMPLETED ? new Date() : null
    },
    create: {
      enrollmentId: enrollment.id,
      contentId,
      status: data.status,
      watchedDuration: data.watchedDuration,
      completedAt: data.status === ProgressStatus.COMPLETED ? new Date() : null
    }
  });
}

export async function getLearningJourney(userId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    include: {
      course: {
        include: {
          tenant: true,
          modules: {
            orderBy: { sequenceNumber: "asc" },
            include: { contents: { include: { progress: { where: { enrollment: { userId } } } } } }
          }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return enrollments.map((enrollment) => {
    const contents = enrollment.course.modules.flatMap((module) => module.contents);
    const completed = contents.filter((content) =>
      content.progress.some((progress) => progress.status === ProgressStatus.COMPLETED)
    ).length;
    return {
      enrollmentId: enrollment.id,
      course: enrollment.course,
      completed,
      total: contents.length,
      progressPercent: contents.length ? Math.round((completed / contents.length) * 100) : 0
    };
  });
}

export async function listLearnerAnnouncements(tenantId: string, userId: string, page: number, limit: number) {
  const where: Prisma.AnnouncementCourseWhereInput = {
    course: { tenantId, enrollments: { some: { userId } } },
    announcement: {
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    }
  };

  const [total, rows] = await Promise.all([
    prisma.announcementCourse.count({ where }),
    prisma.announcementCourse.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ isPinned: "desc" }, { announcement: { createdAt: "desc" } }],
      include: {
        course: true,
        announcement: true,
        reads: { where: { userId } }
      }
    })
  ]);

  return {
    rows: rows.map((row) => ({ ...row, isRead: row.reads.length > 0 })),
    total
  };
}

export async function getLearnerAnnouncement(tenantId: string, userId: string, announcementId: string) {
  const row = await prisma.announcementCourse.findFirst({
    where: {
      announcementId,
      course: { tenantId, enrollments: { some: { userId } } },
      announcement: { deletedAt: null }
    },
    include: { course: true, announcement: true, reads: { where: { userId } } }
  });

  if (!row) throw new NotFoundError("Announcement not found");
  return { ...row, isRead: row.reads.length > 0 };
}

export async function markAnnouncementRead(userId: string, announcementCourseId: string) {
  return prisma.announcementRead.upsert({
    where: { announcementCourseId_userId: { announcementCourseId, userId } },
    update: { readAt: new Date() },
    create: { announcementCourseId, userId }
  });
}

export async function getUnreadAnnouncementCount(tenantId: string, userId: string) {
  const rows = await prisma.announcementCourse.findMany({
    where: {
      course: { tenantId, enrollments: { some: { userId } } },
      announcement: {
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      reads: { none: { userId } }
    },
    select: { id: true }
  });
  return { count: rows.length };
}

export async function listTenants(page: number, limit: number) {
  const [total, rows] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { name: "asc" } })
  ]);
  return { total, rows };
}

export async function getTenant(id: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new NotFoundError("Tenant not found");
  return tenant;
}

export async function createTenant(data: { name: string; domain: string }) {
  return prisma.tenant.create({ data });
}

export async function updateTenant(id: string, data: { name?: string; domain?: string }) {
  return prisma.tenant.update({ where: { id }, data });
}

export async function listRoles(page: number, limit: number) {
  const [total, rows] = await Promise.all([
    prisma.role.count(),
    prisma.role.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { name: "asc" } })
  ]);
  return { total, rows };
}

export async function getRole(id: string) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new NotFoundError("Role not found");
  return role;
}

export async function createRole(data: { name: string }) {
  return prisma.role.create({ data });
}

export async function updateRole(id: string, data: { name?: string }) {
  return prisma.role.update({ where: { id }, data });
}

export async function deleteRole(id: string) {
  return prisma.role.delete({ where: { id } });
}

export async function listAdminCourses(page: number, limit: number, tenantId?: string) {
  const where = tenantId ? { tenantId } : {};
  const [total, rows] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: { tenant: true, roles: { include: { role: true } }, modules: true, enrollments: true }
    })
  ]);
  return { total, rows: rows.map((row) => ({ ...row, roleNames: roleNames(row.roles) })) };
}

export async function getAdminCourse(id: string) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      tenant: true,
      roles: { include: { role: true } },
      modules: { orderBy: { sequenceNumber: "asc" }, include: moduleInclude },
      enrollments: { include: { user: true } },
      announcementCourses: { include: { announcement: true } }
    }
  });
  if (!course) throw new NotFoundError("Course not found");
  return { ...course, roleNames: roleNames(course.roles) };
}

export async function createCourse(data: {
  tenantId: string;
  title: string;
  description?: string;
  coverImage?: string;
  roleIds?: string[];
}) {
  return prisma.course.create({
    data: {
      tenantId: data.tenantId,
      title: data.title,
      description: data.description,
      coverImage: data.coverImage,
      roles: { create: (data.roleIds ?? []).map((roleId) => ({ roleId })) }
    },
    include: { roles: { include: { role: true } } }
  });
}

export async function updateCourse(id: string, data: {
  tenantId?: string;
  title?: string;
  description?: string;
  coverImage?: string;
  roleIds?: string[];
}) {
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.update({
      where: { id },
      data: {
        tenantId: data.tenantId,
        title: data.title,
        description: data.description,
        coverImage: data.coverImage
      }
    });
    if (data.roleIds) {
      await tx.courseRole.deleteMany({ where: { courseId: id } });
      await tx.courseRole.createMany({ data: data.roleIds.map((roleId) => ({ courseId: id, roleId })), skipDuplicates: true });
    }
    return course;
  });
}

export async function deleteCourse(id: string) {
  return prisma.course.delete({ where: { id } });
}

export async function cloneCourse(id: string, tenantId: string) {
  const source = await prisma.course.findUnique({
    where: { id },
    include: { roles: true, modules: { include: moduleInclude } }
  });
  if (!source) throw new NotFoundError("Course not found");

  return prisma.course.create({
    data: {
      tenantId,
      title: `${source.title} (Copy)`,
      description: source.description,
      coverImage: source.coverImage,
      roles: { create: source.roles.map((role) => ({ roleId: role.roleId })) },
      modules: {
        create: source.modules.map((module) => ({
          title: module.title,
          description: module.description,
          sequenceNumber: module.sequenceNumber,
          startsAt: module.startsAt,
          contents: {
            create: module.contents.map((content) => ({
              type: content.type,
              title: content.title,
              description: content.description,
              sequenceNumber: content.sequenceNumber,
              video: content.video
                ? {
                    create: {
                      externalVideoId: content.video.externalVideoId,
                      duration: content.video.duration,
                      thumbnailUrl: content.video.thumbnailUrl,
                      transcript: content.video.transcript
                    }
                  }
                : undefined,
              audio: content.audio ? { create: { url: content.audio.url, duration: content.audio.duration } } : undefined,
              document: content.document
                ? { create: { fileUrl: content.document.fileUrl, fileType: content.document.fileType, fileSize: content.document.fileSize } }
                : undefined,
              richText: content.richText ? { create: { body: content.richText.body } } : undefined,
              image: content.image ? { create: { url: content.image.url, altText: content.image.altText } } : undefined
            }))
          }
        }))
      }
    }
  });
}

export async function replaceCourseRoles(courseId: string, roleIds: string[]) {
  await prisma.courseRole.deleteMany({ where: { courseId } });
  if (roleIds.length) {
    await prisma.courseRole.createMany({ data: roleIds.map((roleId) => ({ courseId, roleId })), skipDuplicates: true });
  }
  return getAdminCourse(courseId);
}

export async function listModules(courseId: string) {
  return prisma.module.findMany({
    where: { courseId },
    orderBy: { sequenceNumber: "asc" },
    include: { contents: { orderBy: { sequenceNumber: "asc" }, include: contentInclude } }
  });
}

export async function getModule(id: string) {
  const module = await prisma.module.findUnique({ where: { id }, include: moduleInclude });
  if (!module) throw new NotFoundError("Module not found");
  return module;
}

export async function createModule(data: {
  courseId: string;
  title: string;
  description?: string;
  sequenceNumber?: number;
  startsAt?: string | null;
}) {
  return prisma.module.create({
    data: {
      courseId: data.courseId,
      title: data.title,
      description: data.description,
      sequenceNumber: data.sequenceNumber ?? 0,
      startsAt: data.startsAt ? new Date(data.startsAt) : null
    }
  });
}

export async function updateModule(id: string, data: Partial<Parameters<typeof createModule>[0]>) {
  return prisma.module.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      sequenceNumber: data.sequenceNumber,
      startsAt: data.startsAt ? new Date(data.startsAt) : data.startsAt === null ? null : undefined
    }
  });
}

export async function deleteModule(id: string) {
  return prisma.module.delete({ where: { id } });
}

export async function reorderModules(courseId: string, moduleIds: string[]) {
  await prisma.$transaction(
    moduleIds.map((id, index) => prisma.module.updateMany({ where: { id, courseId }, data: { sequenceNumber: index + 1 } }))
  );
  return listModules(courseId);
}

async function createContentRecord(tx: Prisma.TransactionClient, data: any) {
  const base = await tx.content.create({
    data: {
      moduleId: data.moduleId,
      type: data.type,
      title: data.title,
      description: data.description,
      sequenceNumber: data.sequenceNumber ?? 0
    }
  });

  if (data.type === ContentType.VIDEO) {
    await tx.video.create({
      data: {
        contentId: base.id,
        externalVideoId: data.externalVideoId,
        duration: data.duration,
        thumbnailUrl: data.thumbnailUrl,
        transcript: data.transcript
      }
    });
    await tx.content.create({
      data: {
        moduleId: data.moduleId,
        type: ContentType.AUDIO,
        title: `${data.title} - Audio`,
        description: "Auto-extracted audio companion",
        sequenceNumber: (data.sequenceNumber ?? 0) + 1,
        audio: {
          create: {
            url: data.audioUrl ?? `gumlet://${data.externalVideoId}/audio`,
            duration: data.duration
          }
        }
      }
    });
  }

  if (data.type === ContentType.AUDIO) {
    await tx.audio.create({ data: { contentId: base.id, url: data.url, duration: data.duration } });
  }
  if (data.type === ContentType.DOCUMENT) {
    await tx.document.create({
      data: {
        contentId: base.id,
        fileUrl: data.fileUrl,
        fileType: data.fileType,
        fileSize: data.fileSize
      }
    });
  }
  if (data.type === ContentType.RICH_TEXT) {
    await tx.richText.create({ data: { contentId: base.id, body: data.body ?? "" } });
  }
  if (data.type === ContentType.IMAGE) {
    await tx.image.create({ data: { contentId: base.id, url: data.url, altText: data.altText } });
  }

  return tx.content.findUnique({ where: { id: base.id }, include: contentInclude });
}

export async function listContents(moduleId: string) {
  return prisma.content.findMany({ where: { moduleId }, orderBy: { sequenceNumber: "asc" }, include: contentInclude });
}

export async function getContent(id: string) {
  const content = await prisma.content.findUnique({ where: { id }, include: contentInclude });
  if (!content) throw new NotFoundError("Content not found");
  return content;
}

export async function createContent(data: any) {
  return prisma.$transaction((tx) => createContentRecord(tx, data));
}

export async function updateContent(id: string, data: any) {
  return prisma.content.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      sequenceNumber: data.sequenceNumber
    },
    include: contentInclude
  });
}

export async function deleteContent(id: string) {
  return prisma.content.delete({ where: { id } });
}

export async function reorderContents(moduleId: string, contentIds: string[]) {
  await prisma.$transaction(
    contentIds.map((id, index) => prisma.content.updateMany({ where: { id, moduleId }, data: { sequenceNumber: index + 1 } }))
  );
  return listContents(moduleId);
}

export async function listUsers(page: number, limit: number, roleId?: string) {
  const where: Prisma.UserWhereInput = roleId ? { roles: { some: { roleId } } } : {};
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: "asc" },
      include: { roles: { include: { role: true } }, enrollments: true }
    })
  ]);
  return { total, rows: rows.map((row) => ({ ...row, roleNames: roleNames(row.roles) })) };
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { roles: { include: { role: true } }, enrollments: { include: { course: true } } }
  });
  if (!user) throw new NotFoundError("User not found");
  return { ...user, roleNames: roleNames(user.roles) };
}

export async function createUser(data: { name: string; email: string; phone?: string; imageUrl?: string; roleIds?: string[] }) {
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone,
      imageUrl: data.imageUrl,
      roles: { create: (data.roleIds ?? []).map((roleId) => ({ roleId })) }
    }
  });
  if (data.roleIds?.length) await autoEnrollUserForRoles(user.id, data.roleIds);
  return getUser(user.id);
}

export async function updateUser(id: string, data: { name?: string; email?: string; phone?: string; imageUrl?: string }) {
  return prisma.user.update({ where: { id }, data: { ...data, email: data.email?.toLowerCase() } });
}

export async function deleteUser(id: string) {
  return prisma.user.delete({ where: { id } });
}

export async function getUserRoles(userId: string) {
  return prisma.userRole.findMany({ where: { userId }, include: { role: true } });
}

async function autoEnrollUserForRoles(userId: string, roleIds: string[]) {
  const courses = await prisma.course.findMany({ where: { roles: { some: { roleId: { in: roleIds } } } } });
  if (courses.length) {
    await prisma.enrollment.createMany({
      data: courses.map((course) => ({ userId, courseId: course.id })),
      skipDuplicates: true
    });
  }
}

export async function replaceUserRoles(userId: string, roleIds: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId } });
    if (roleIds.length) {
      await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })), skipDuplicates: true });
    }
  });
  await autoEnrollUserForRoles(userId, roleIds);
  return getUser(userId);
}

export async function listEnrollments(page: number, limit: number) {
  const [total, rows] = await Promise.all([
    prisma.enrollment.count(),
    prisma.enrollment.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { user: true, course: { include: { tenant: true } } }
    })
  ]);
  return { total, rows };
}

export async function listCourseEnrollments(courseId: string) {
  return prisma.enrollment.findMany({ where: { courseId }, include: { user: true }, orderBy: { createdAt: "desc" } });
}

export async function createEnrollment(data: { userId: string; courseId: string }) {
  return prisma.enrollment.upsert({
    where: { userId_courseId: data },
    update: {},
    create: data
  });
}

export async function bulkEnroll(courseId: string, users: { email: string; name: string; phone?: string }[]) {
  const created = [];
  for (const input of users) {
    const user = await prisma.user.upsert({
      where: { email: input.email.toLowerCase() },
      update: { name: input.name, phone: input.phone },
      create: { email: input.email.toLowerCase(), name: input.name, phone: input.phone }
    });
    created.push(await createEnrollment({ userId: user.id, courseId }));
  }
  return created;
}

export async function deleteEnrollment(id: string) {
  return prisma.enrollment.delete({ where: { id } });
}

export async function getCourseProgress(courseId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId },
    include: {
      user: true,
      course: { include: { modules: { include: { contents: true } } } },
      progress: true
    }
  });

  return enrollments.map((enrollment) => {
    const total = enrollment.course.modules.flatMap((module) => module.contents).length;
    const completed = enrollment.progress.filter((progress) => progress.status === ProgressStatus.COMPLETED).length;
    return { user: enrollment.user, total, completed, progressPercent: total ? Math.round((completed / total) * 100) : 0 };
  });
}

export async function getUserProgress(userId: string) {
  return getLearningJourney(userId);
}

export async function listAdminAnnouncements(page: number, limit: number, tenantId?: string) {
  const where: Prisma.AnnouncementWhereInput = { deletedAt: null, ...(tenantId ? { tenantId } : {}) };
  const [total, rows] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { tenant: true, courses: { include: { course: true, reads: true } } }
    })
  ]);
  return { total, rows };
}

export async function getAdminAnnouncement(id: string) {
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: { tenant: true, courses: { include: { course: true, reads: true } } }
  });
  if (!announcement || announcement.deletedAt) throw new NotFoundError("Announcement not found");
  return announcement;
}

export async function createAnnouncement(data: any) {
  return prisma.announcement.create({
    data: {
      tenantId: data.tenantId,
      authorId: data.authorId,
      title: data.title,
      bodyHtml: data.bodyHtml,
      imageUrl: data.imageUrl,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      courses: { create: (data.courseIds ?? []).map((courseId: string) => ({ courseId, isPinned: Boolean(data.pinnedCourseIds?.includes(courseId)) })) }
    }
  });
}

export async function updateAnnouncement(id: string, data: any) {
  return prisma.announcement.update({
    where: { id },
    data: {
      title: data.title,
      bodyHtml: data.bodyHtml,
      imageUrl: data.imageUrl,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : data.expiresAt === null ? null : undefined
    }
  });
}

export async function deleteAnnouncement(id: string) {
  return prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function getAnnouncementPinContext(id: string) {
  const announcement = await getAdminAnnouncement(id);
  const courses = await prisma.course.findMany({ where: { tenantId: announcement.tenantId }, orderBy: { title: "asc" } });
  return { announcement, courses };
}

export async function updateAnnouncementPins(id: string, courseIds: string[], pinnedCourseIds: string[]) {
  await prisma.announcementCourse.deleteMany({ where: { announcementId: id } });
  if (courseIds.length) {
    await prisma.announcementCourse.createMany({
      data: courseIds.map((courseId) => ({
        announcementId: id,
        courseId,
        isPinned: pinnedCourseIds.includes(courseId)
      })),
      skipDuplicates: true
    });
  }
  return getAdminAnnouncement(id);
}

export async function registerUpload(kind: string, fileName: string) {
  const base = process.env.R2_PUBLIC_BASE_URL || "https://example.com/uploads";
  const key = `${kind}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  return { url: `${base}/${key}`, key };
}
