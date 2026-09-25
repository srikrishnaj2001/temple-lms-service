// AdminJS setup with older CommonJS compatible versions

const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const AdminJSSequelize = require('@adminjs/sequelize');

// Register the Sequelize adapter
AdminJS.registerAdapter({
  Resource: AdminJSSequelize.Resource,
  Database: AdminJSSequelize.Database,
});

// Import your models
const {
  Tenant,
  Course,
  Cohort,
  Module,
  Content,
  Video,
  Assignment,
  Resource,
  Event,
  User,
  UserMetadata,
  Enrollment,
  CohortManager,
  Tool,
  CohortTool,
  EnrollmentContentProgress,
  CommunityLink,
  Form,
  FormQuestion,
  FormResponse,
  Announcement,
  AnnouncementCohort,
  AnnouncementRead,
  VideoAttachment
} = require('../models');

const adminOptions = {
  resources: [
    // ==================== TENANTS ====================
    {
      resource: Tenant,
      options: {
        navigation: { name: 'Tenants', icon: 'Home' },
        listProperties: ['id', 'subdomain', 'name', 'is_active', 'created_at'],
        editProperties: ['subdomain', 'name', 'branding_config', 'is_active'],
        filterProperties: ['id', 'subdomain', 'name', 'is_active'],
        showProperties: ['id', 'subdomain', 'name', 'branding_config', 'is_active', 'created_at', 'updated_at'],
      },
    },
    // ==================== COHORTS ====================
    {
      resource: Cohort,
      options: {
        navigation: { name: 'Cohorts', icon: 'Book' },
        listProperties: ['id', 'title', 'description', 'tenant_id', 'course_id', 'start_date', 'end_date', 'calendar_url', 'referral_url', 'created_at', 'updated_at'],
        editProperties: ['title', 'description', 'tenant_id', 'course_id', 'start_date', 'end_date', 'calendar_url', 'referral_url'],
        filterProperties: ['id', 'title', 'tenant_id', 'start_date', 'end_date'],
        showProperties: ['id', 'title', 'description', 'tenant_id', 'course_id', 'start_date', 'end_date', 'calendar_url', 'referral_url', 'created_at', 'updated_at'],
        sort: { sortBy: 'id', direction: 'asc' },
      },
    },
    // ==================== COURSES (CATALOG) ====================
    {
      resource: Course,
      options: {
        navigation: { name: 'Cohorts', icon: 'Book' },
        listProperties: ['id', 'title', 'description', 'tenant_id', 'cloned_from_course_id', 'created_at', 'updated_at'],
        editProperties: ['title', 'description', 'tenant_id', 'cloned_from_course_id'],
        filterProperties: ['id', 'title', 'tenant_id'],
        showProperties: ['id', 'title', 'description', 'tenant_id', 'cloned_from_course_id', 'created_at', 'updated_at'],
        sort: { sortBy: 'id', direction: 'asc' },
      },
    },
    {
      resource: Module,
      options: {
        navigation: { name: 'Cohorts', icon: 'Book' },
        listProperties: ['id', 'title', 'description', 'cohort_id', 'sequence_number', 'start_date', 'end_date', 'created_at', 'updated_at', 'deleted_at'],
        editProperties: ['title', 'description', 'cohort_id', 'sequence_number', 'start_date', 'end_date'],
        filterProperties: ['id', 'title', 'cohort_id', 'sequence_number', 'start_date'],
        showProperties: ['id', 'title', 'description', 'cohort_id', 'sequence_number', 'start_date', 'end_date', 'created_at', 'updated_at', 'deleted_at'],
        sort: { sortBy: 'sequence_number', direction: 'asc' },
      },
    },
    {
      resource: Content,
      options: {
        navigation: { name: 'Courses', icon: 'Book' },
        listProperties: ['id', 'content_type', 'content_id', 'module_id', 'sequence_number', 'start_date', 'created_at', 'updated_at', 'deleted_at'],
        editProperties: ['content_id', 'content_type', 'module_id', 'sequence_number', 'start_date'],
        filterProperties: ['id', 'content_type', 'content_id', 'module_id', 'sequence_number'],
        showProperties: ['id', 'content_type', 'content_id', 'module_id', 'sequence_number', 'start_date', 'created_at', 'updated_at', 'deleted_at'],
        sort: { sortBy: 'sequence_number', direction: 'asc' },
      },
    },
    // ==================== CONTENT TYPES ====================
    {
      resource: Video,
      options: {
        navigation: { name: 'Content Types', icon: 'Video' },
        listProperties: ['id', 'title', 'description', 'type', 'external_video_id', 'duration_ms', 'summary', 'created_at', 'updated_at'],
        editProperties: ['title', 'description', 'type', 'external_video_id', 'duration_ms', 'summary'],
        filterProperties: ['id', 'title', 'type', 'external_video_id'],
        showProperties: ['id', 'title', 'description', 'type', 'external_video_id', 'duration_ms', 'summary', 'created_at', 'updated_at'],
      },
    },
    {
      resource: VideoAttachment,
      options: {
        navigation: { name: 'Content Types', icon: 'Video' },
        listProperties: ['id', 'video_id', 'content_type', 'content_id', 'sequence_number', 'created_at', 'updated_at'],
        editProperties: ['video_id', 'content_type', 'content_id', 'sequence_number'],
        filterProperties: ['id', 'video_id', 'content_type', 'content_id'],
        showProperties: ['id', 'video_id', 'content_type', 'content_id', 'sequence_number', 'created_at', 'updated_at'],
        sort: { sortBy: 'video_id', direction: 'asc' },
      },
    },
    {
      resource: Assignment,
      options: {
        navigation: { name: 'Content Types', icon: 'Video' },
        listProperties: ['id', 'title', 'description', 'url', 'created_at', 'updated_at'],
        editProperties: ['title', 'description', 'url'],
        filterProperties: ['id', 'title'],
        showProperties: ['id', 'title', 'description', 'url', 'created_at', 'updated_at'],
      },
    },
    {
      resource: Resource,
      options: {
        navigation: { name: 'Content Types', icon: 'Video' },
        listProperties: ['id', 'title', 'description', 'type', 'url', 'created_at', 'updated_at'],
        editProperties: ['title', 'description', 'url', 'type'],
        filterProperties: ['id', 'title', 'type'],
        showProperties: ['id', 'title', 'description', 'type', 'url', 'created_at', 'updated_at'],
      },
    },
    {
      resource: Event,
      options: {
        navigation: { name: 'Content Types', icon: 'Video' },
        listProperties: ['id', 'title', 'description', 'start_time', 'end_time', 'created_at', 'updated_at'],
        editProperties: ['title', 'description', 'start_time', 'end_time'],
        filterProperties: ['id', 'title', 'start_time', 'end_time'],
        showProperties: ['id', 'title', 'description', 'start_time', 'end_time', 'created_at', 'updated_at'],
        sort: { sortBy: 'start_time', direction: 'desc' },
      },
    },

    // ==================== USERS ====================
    {
      resource: User,
      options: {
        navigation: { name: 'Users', icon: 'User' },
        listProperties: ['id', 'name', 'email', 'phone', 'image_url', 'created_at', 'updated_at', 'deleted_at'],
        editProperties: ['name', 'email', 'phone', 'image_url'],
        filterProperties: ['id', 'name', 'email', 'phone'],
        showProperties: ['id', 'name', 'email', 'phone', 'image_url', 'created_at', 'updated_at', 'deleted_at'],
        sort: { sortBy: 'id', direction: 'desc' },
      },
    },
    {
      resource: UserMetadata,
      options: {
        navigation: { name: 'Users', icon: 'User' },
        listProperties: ['id', 'user_id', 'company', 'designation', 'picture_url', 'about', 'urls', 'created_at', 'updated_at'],
        editProperties: ['user_id', 'company', 'designation', 'urls', 'picture_url', 'about'],
        filterProperties: ['id', 'user_id', 'company', 'designation'],
        showProperties: ['id', 'user_id', 'company', 'designation', 'urls', 'picture_url', 'about', 'created_at', 'updated_at'],
      },
    },

    // ==================== ENROLLMENTS ====================
    {
      resource: Enrollment,
      options: {
        navigation: { name: 'Enrollments', icon: 'Archive' },
        listProperties: ['id', 'cohort_id', 'user_id', 'created_at', 'updated_at', 'deleted_at'],
        editProperties: ['cohort_id', 'user_id'],
        filterProperties: ['id', 'cohort_id', 'user_id'],
        showProperties: ['id', 'cohort_id', 'user_id', 'created_at', 'updated_at', 'deleted_at'],
        sort: { sortBy: 'id', direction: 'desc' },
      },
    },
    {
      resource: EnrollmentContentProgress,
      options: {
        navigation: { name: 'Enrollments', icon: 'Archive' },
        listProperties: ['id', 'enrollment_id', 'content_id', 'module_id', 'status', 'watched_duration', 'created_at', 'updated_at'],
        editProperties: ['enrollment_id', 'content_id', 'module_id', 'status', 'watched_duration'],
        filterProperties: ['id', 'enrollment_id', 'content_id', 'module_id', 'status'],
        showProperties: ['id', 'enrollment_id', 'content_id', 'module_id', 'status', 'watched_duration', 'created_at', 'updated_at'],
        sort: { sortBy: 'id', direction: 'desc' },
      },
    },

    // ==================== COURSE MANAGEMENT ====================
    {
      resource: CohortManager,
      options: {
        navigation: { name: 'Cohort Management', icon: 'Settings' },
        listProperties: ['id', 'user_id', 'cohort_id', 'type', 'created_at', 'updated_at', 'deleted_at'],
        editProperties: ['user_id', 'cohort_id', 'type'],
        filterProperties: ['id', 'user_id', 'cohort_id', 'type'],
        showProperties: ['id', 'user_id', 'cohort_id', 'type', 'created_at', 'updated_at', 'deleted_at'],
      },
    },
    {
      resource: Tool,
      options: {
        navigation: { name: 'Course Management', icon: 'Settings' },
        listProperties: ['id', 'title', 'description', 'url', 'created_at', 'updated_at'],
        editProperties: ['title', 'description', 'url'],
        filterProperties: ['id', 'title'],
        showProperties: ['id', 'title', 'description', 'url', 'created_at', 'updated_at'],
        sort: { sortBy: 'id', direction: 'asc' },
      },
    },
    {
      resource: CohortTool,
      options: {
        navigation: { name: 'Cohort Management', icon: 'Settings' },
        listProperties: ['id', 'cohort_id', 'tool_id', 'created_at', 'updated_at'],
        editProperties: ['cohort_id', 'tool_id'],
        filterProperties: ['id', 'cohort_id', 'tool_id'],
        showProperties: ['id', 'cohort_id', 'tool_id', 'created_at', 'updated_at'],
        sort: { sortBy: 'cohort_id', direction: 'asc' },
      },
    },
    {
      resource: CommunityLink,
      options: {
        navigation: { name: 'Course Management', icon: 'Settings' },
        listProperties: ['id', 'title', 'url', 'description', 'cohort_id', 'created_at', 'updated_at', 'deleted_at'],
        editProperties: ['title', 'url', 'description', 'cohort_id'],
        filterProperties: ['id', 'title', 'cohort_id'],
        showProperties: ['id', 'title', 'url', 'description', 'cohort_id', 'created_at', 'updated_at', 'deleted_at'],
      },
    },

    // ==================== FORMS ====================
    {
      resource: Form,
      options: {
        navigation: { name: 'Forms', icon: 'Document' },
        listProperties: ['id', 'cohort_id', 'tenant_id', 'form_type', 'trigger_date', 'is_enabled', 'created_at', 'updated_at'],
        editProperties: ['cohort_id', 'tenant_id', 'form_type', 'trigger_date', 'is_enabled'],
        filterProperties: ['id', 'cohort_id', 'form_type', 'is_enabled'],
        showProperties: ['id', 'cohort_id', 'tenant_id', 'form_type', 'trigger_date', 'is_enabled', 'created_at', 'updated_at'],
        sort: { sortBy: 'id', direction: 'desc' },
      },
    },
    {
      resource: FormQuestion,
      options: {
        navigation: { name: 'Forms', icon: 'Document' },
        listProperties: ['id', 'form_id', 'question', 'type', 'options', 'sequence_number', 'created_at', 'updated_at'],
        editProperties: ['form_id', 'question', 'type', 'options', 'sequence_number'],
        filterProperties: ['id', 'form_id', 'type', 'sequence_number'],
        showProperties: ['id', 'form_id', 'question', 'type', 'options', 'sequence_number', 'created_at', 'updated_at'],
        sort: { sortBy: 'sequence_number', direction: 'asc' },
      },
    },
    {
      resource: FormResponse,
      options: {
        navigation: { name: 'Forms', icon: 'Document' },
        listProperties: ['id', 'form_question_id', 'enrollment_id', 'response', 'created_at', 'updated_at'],
        editProperties: ['form_question_id', 'enrollment_id', 'response'],
        filterProperties: ['id', 'form_question_id', 'enrollment_id'],
        showProperties: ['id', 'form_question_id', 'enrollment_id', 'response', 'created_at', 'updated_at'],
        sort: { sortBy: 'id', direction: 'desc' },
      },
    },

    // ==================== ANNOUNCEMENTS ====================
    {
      resource: Announcement,
      options: {
        navigation: { name: 'Announcements', icon: 'MessageCircle' },
        listProperties: ['id', 'title', 'body_preview', 'image_url', 'author_user_id', 'expiry_at', 'created_at', 'updated_at', 'deleted_at'],
        editProperties: ['title', 'body_html', 'body_preview', 'image_url', 'author_user_id', 'expiry_at'],
        filterProperties: ['id', 'title', 'author_user_id', 'expiry_at'],
        showProperties: ['id', 'title', 'body_html', 'body_preview', 'image_url', 'author_user_id', 'expiry_at', 'created_at', 'updated_at', 'deleted_at'],
        sort: { sortBy: 'created_at', direction: 'desc' },
      },
    },
    {
      resource: AnnouncementCohort,
      options: {
        navigation: { name: 'Announcements', icon: 'MessageCircle' },
        listProperties: ['id', 'announcement_id', 'cohort_id', 'is_pinned', 'pinned_at', 'is_home', 'attached_at', 'created_at', 'updated_at', 'deleted_at'],
        editProperties: ['announcement_id', 'cohort_id', 'is_pinned', 'is_home'],
        filterProperties: ['id', 'announcement_id', 'cohort_id', 'is_pinned', 'is_home'],
        showProperties: ['id', 'announcement_id', 'cohort_id', 'is_pinned', 'pinned_at', 'is_home', 'attached_at', 'created_at', 'updated_at', 'deleted_at'],
      },
    },
    {
      resource: AnnouncementRead,
      options: {
        navigation: { name: 'Announcements', icon: 'MessageCircle' },
        listProperties: ['id', 'announcement_course_id', 'user_id', 'read_at', 'created_at', 'updated_at'],
        editProperties: ['announcement_course_id', 'user_id', 'read_at'],
        filterProperties: ['id', 'announcement_course_id', 'user_id'],
        showProperties: ['id', 'announcement_course_id', 'user_id', 'read_at', 'created_at', 'updated_at'],
      },
    },
  ],
  rootPath: '/admin',
  branding: {
    companyName: 'CLUG Service',
    logo: false,
    softwareBrothers: false,
  },
};

const admin = new AdminJS(adminOptions);

// Build the router
const buildAdminRouter = (app) => {
  try {
    const adminRouter = AdminJSExpress.buildRouter(admin);

    // Disable CSP for admin routes
    app.use(admin.options.rootPath, (req, res, next) => {
      res.removeHeader('Content-Security-Policy');
      res.removeHeader('X-Content-Security-Policy');
      res.removeHeader('X-WebKit-CSP');
      next();
    });

    app.use(admin.options.rootPath, adminRouter);

    console.log(`✅ AdminJS available at http://localhost:${process.env.PORT || 8006}/admin`);

    return adminRouter;
  } catch (error) {
    console.error('❌ Error building admin router:', error.message);
    return null;
  }
};

module.exports = {
  admin,
  buildAdminRouter,
};
