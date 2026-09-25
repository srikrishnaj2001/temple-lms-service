'use strict';

module.exports = (models) => {
  const {
    Tenant,
    Course,
    Role,
    UserRole,
    CourseRole,
    Module,
    Content,
    Video,
    Resource,
    ContentAttachment,
    Category,
    CourseCategory,
    User,
    Enrollment,
    EnrollmentContentProgress,
    Announcement,
    AnnouncementCourse,
    AnnouncementRead
  } = models;

  if (Tenant && Course) {
    Tenant.hasMany(Course, { foreignKey: 'tenantId', as: 'courses' });
    Course.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
  }

  if (Role && User && UserRole) {
    Role.belongsToMany(User, {
      through: UserRole,
      foreignKey: 'roleId',
      otherKey: 'userId',
      as: 'users'
    });
    User.belongsToMany(Role, {
      through: UserRole,
      foreignKey: 'userId',
      otherKey: 'roleId',
      as: 'roles'
    });
    UserRole.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    UserRole.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
  }

  if (Role && Course && CourseRole) {
    Role.belongsToMany(Course, {
      through: CourseRole,
      foreignKey: 'roleId',
      otherKey: 'courseId',
      as: 'courses'
    });
    Course.belongsToMany(Role, {
      through: CourseRole,
      foreignKey: 'courseId',
      otherKey: 'roleId',
      as: 'roles'
    });
    CourseRole.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
    CourseRole.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
  }

  if (Category && Course && CourseCategory) {
    Category.belongsToMany(Course, {
      through: CourseCategory,
      foreignKey: 'categoryId',
      otherKey: 'courseId',
      as: 'courses'
    });
    Course.belongsToMany(Category, {
      through: CourseCategory,
      foreignKey: 'courseId',
      otherKey: 'categoryId',
      as: 'categories'
    });
    CourseCategory.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
    CourseCategory.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  }

  if (Course && Module) {
    Course.hasMany(Module, {
      foreignKey: 'courseId',
      as: 'modules',
      onDelete: 'RESTRICT'
    });
    Module.belongsTo(Course, {
      foreignKey: 'courseId',
      as: 'course'
    });
  }

  if (Module && Content) {
    Module.hasMany(Content, {
      foreignKey: 'moduleId',
      as: 'contents',
      onDelete: 'RESTRICT'
    });
    Content.belongsTo(Module, {
      foreignKey: 'moduleId',
      as: 'module'
    });
  }

  if (Content && EnrollmentContentProgress) {
    Content.hasMany(EnrollmentContentProgress, {
      foreignKey: 'contentId',
      as: 'progressRecords',
      onDelete: 'CASCADE'
    });
    EnrollmentContentProgress.belongsTo(Content, {
      foreignKey: 'contentId',
      as: 'content'
    });
  }

  if (Course && User && Enrollment) {
    Course.hasMany(Enrollment, {
      foreignKey: 'courseId',
      as: 'enrollments',
      onDelete: 'RESTRICT'
    });
    User.hasMany(Enrollment, {
      foreignKey: 'userId',
      as: 'enrollments',
      onDelete: 'RESTRICT'
    });
    Course.belongsToMany(User, {
      through: Enrollment,
      foreignKey: 'courseId',
      otherKey: 'userId',
      as: 'students'
    });
    User.belongsToMany(Course, {
      through: Enrollment,
      foreignKey: 'userId',
      otherKey: 'courseId',
      as: 'enrolledCourses'
    });
    Enrollment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
    Enrollment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  }

  if (Enrollment && EnrollmentContentProgress && Module) {
    Enrollment.hasMany(EnrollmentContentProgress, {
      foreignKey: 'enrollmentId',
      as: 'contentProgress',
      onDelete: 'CASCADE'
    });
    Module.hasMany(EnrollmentContentProgress, {
      foreignKey: 'moduleId',
      as: 'progressRecords',
      onDelete: 'CASCADE'
    });
    EnrollmentContentProgress.belongsTo(Enrollment, {
      foreignKey: 'enrollmentId',
      as: 'enrollment'
    });
    EnrollmentContentProgress.belongsTo(Module, {
      foreignKey: 'moduleId',
      as: 'module'
    });
  }

  if (Video) {
    Video.hasMany(Content, {
      foreignKey: 'contentId',
      constraints: false,
      scope: { contentType: 'VIDEO' },
      as: 'contentReferences'
    });
  }

  if (Resource) {
    Resource.hasMany(Content, {
      foreignKey: 'contentId',
      constraints: false,
      scope: { contentType: 'RESOURCE' },
      as: 'contentReferences'
    });
  }

  if (Content && Resource && ContentAttachment) {
    Content.hasMany(ContentAttachment, {
      foreignKey: 'contentId',
      as: 'attachments',
      onDelete: 'CASCADE'
    });
    Resource.hasMany(ContentAttachment, {
      foreignKey: 'resourceId',
      as: 'contentAttachments',
      onDelete: 'CASCADE'
    });
    ContentAttachment.belongsTo(Content, { foreignKey: 'contentId', as: 'content' });
    ContentAttachment.belongsTo(Resource, { foreignKey: 'resourceId', as: 'resource' });
  }

  if (Announcement && User && Course && AnnouncementCourse && AnnouncementRead) {
    Announcement.belongsTo(User, {
      foreignKey: 'authorUserId',
      as: 'author'
    });
    Announcement.belongsTo(Tenant, {
      foreignKey: 'tenantId',
      as: 'tenant'
    });
    Announcement.hasMany(AnnouncementCourse, {
      foreignKey: 'announcementId',
      as: 'courseLinks',
      onDelete: 'CASCADE'
    });
    AnnouncementCourse.belongsTo(Announcement, {
      foreignKey: 'announcementId',
      as: 'announcement'
    });
    AnnouncementCourse.belongsTo(Course, {
      foreignKey: 'courseId',
      as: 'course'
    });
    Course.hasMany(AnnouncementCourse, {
      foreignKey: 'courseId',
      as: 'announcementLinks',
      onDelete: 'RESTRICT'
    });
    AnnouncementCourse.hasMany(AnnouncementRead, {
      foreignKey: 'announcementCourseId',
      as: 'reads',
      onDelete: 'CASCADE'
    });
    AnnouncementRead.belongsTo(AnnouncementCourse, {
      foreignKey: 'announcementCourseId',
      as: 'announcementCourse'
    });
    AnnouncementRead.belongsTo(User, {
      foreignKey: 'userId',
      as: 'user'
    });
  }
};
