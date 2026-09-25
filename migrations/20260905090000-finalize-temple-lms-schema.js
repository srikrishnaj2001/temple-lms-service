'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    await sequelize.transaction(async (transaction) => {
      await sequelize.query(`
        DO $$
        DECLARE
          constraint_record RECORD;
        BEGIN
          FOR constraint_record IN
            SELECT conrelid::regclass AS table_name, conname
            FROM pg_constraint
            WHERE contype = 'f'
              AND connamespace = 'public'::regnamespace
          LOOP
            EXECUTE format(
              'ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I',
              constraint_record.table_name,
              constraint_record.conname
            );
          END LOOP;
        END $$;
      `, { transaction });

      await sequelize.query(`
        WITH converted AS (
          INSERT INTO resources (title, description, url, type, created_at, updated_at)
          SELECT a.title, a.description, a.url, 'URL'::enum_resources_type, NOW(), NOW()
          FROM contents c
          JOIN assignments a ON c.content_id = a.id
          WHERE c.content_type = 'ASSIGNMENT'
          RETURNING id, title
        )
        UPDATE contents c
        SET content_id = converted.id, content_type = 'RESOURCE'
        FROM converted
        JOIN assignments a ON a.title = converted.title
        WHERE c.content_type = 'ASSIGNMENT'
          AND c.content_id = a.id;
      `, { transaction });

      await sequelize.query(`
        WITH converted AS (
          INSERT INTO resources (title, description, url, type, created_at, updated_at)
          SELECT e.title, e.description, NULL, 'TEXT'::enum_resources_type, NOW(), NOW()
          FROM contents c
          JOIN events e ON c.content_id = e.id
          WHERE c.content_type = 'EVENT'
          RETURNING id, title
        )
        UPDATE contents c
        SET content_id = converted.id, content_type = 'RESOURCE'
        FROM converted
        JOIN events e ON e.title = converted.title
        WHERE c.content_type = 'EVENT'
          AND c.content_id = e.id;
      `, { transaction });

      await sequelize.query(`
        DROP TABLE IF EXISTS "announcementReads" CASCADE;
        DROP TABLE IF EXISTS "announcementCourses" CASCADE;
        DROP TABLE IF EXISTS "contentAttachments" CASCADE;
        DROP TABLE IF EXISTS "courseRoles" CASCADE;
        DROP TABLE IF EXISTS "userRoles" CASCADE;
        DROP TABLE IF EXISTS roles CASCADE;

        DROP TABLE IF EXISTS cohort_tools CASCADE;
        DROP TABLE IF EXISTS community_links CASCADE;
        DROP TABLE IF EXISTS cohort_managers CASCADE;
        DROP TABLE IF EXISTS forms CASCADE;
        DROP TABLE IF EXISTS form_questions CASCADE;
        DROP TABLE IF EXISTS form_responses CASCADE;
        DROP TABLE IF EXISTS tools CASCADE;
        DROP TABLE IF EXISTS assignments CASCADE;
        DROP TABLE IF EXISTS events CASCADE;
        DROP TABLE IF EXISTS user_metadata CASCADE;
        DROP TABLE IF EXISTS video_attachments CASCADE;
      `, { transaction });

      await sequelize.query(`
        ALTER TABLE IF EXISTS courses RENAME TO course_templates_legacy;
        ALTER TABLE IF EXISTS cohorts DROP COLUMN IF EXISTS course_id;
        ALTER TABLE IF EXISTS cohorts RENAME TO courses;
        DROP TABLE IF EXISTS course_templates_legacy CASCADE;
      `, { transaction });

      await sequelize.query(`
        ALTER TABLE tenants RENAME COLUMN subdomain TO domain;
        ALTER TABLE tenants DROP COLUMN IF EXISTS branding_config;
        ALTER TABLE tenants DROP COLUMN IF EXISTS is_active;
        ALTER TABLE tenants RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE tenants RENAME COLUMN updated_at TO "updatedAt";

        ALTER TABLE users RENAME COLUMN image_url TO "imageUrl";
        ALTER TABLE users RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE users RENAME COLUMN updated_at TO "updatedAt";
        ALTER TABLE users RENAME COLUMN deleted_at TO "deletedAt";

        ALTER TABLE courses DROP COLUMN IF EXISTS start_date;
        ALTER TABLE courses DROP COLUMN IF EXISTS end_date;
        ALTER TABLE courses DROP COLUMN IF EXISTS calendar_url;
        ALTER TABLE courses DROP COLUMN IF EXISTS referral_url;
        ALTER TABLE courses RENAME COLUMN tenant_id TO "tenantId";
        ALTER TABLE courses RENAME COLUMN thumbnail_url TO "thumbnailUrl";
        ALTER TABLE courses RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE courses RENAME COLUMN updated_at TO "updatedAt";

        ALTER TABLE modules RENAME COLUMN cohort_id TO "courseId";
        ALTER TABLE modules RENAME COLUMN sequence_number TO "sequenceNumber";
        ALTER TABLE modules RENAME COLUMN start_date TO "startDate";
        ALTER TABLE modules RENAME COLUMN end_date TO "endDate";
        ALTER TABLE modules RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE modules RENAME COLUMN updated_at TO "updatedAt";
        ALTER TABLE modules RENAME COLUMN deleted_at TO "deletedAt";

        ALTER TABLE contents RENAME COLUMN content_id TO "contentId";
        ALTER TABLE contents RENAME COLUMN content_type TO "contentType";
        ALTER TABLE contents RENAME COLUMN sequence_number TO "sequenceNumber";
        ALTER TABLE contents RENAME COLUMN start_date TO "startDate";
        ALTER TABLE contents RENAME COLUMN module_id TO "moduleId";
        ALTER TABLE contents RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE contents RENAME COLUMN updated_at TO "updatedAt";
        ALTER TABLE contents RENAME COLUMN deleted_at TO "deletedAt";

        ALTER TABLE videos DROP COLUMN IF EXISTS type;
        ALTER TABLE videos RENAME COLUMN external_video_id TO "externalVideoId";
        ALTER TABLE videos RENAME COLUMN duration_ms TO "durationMs";
        ALTER TABLE videos RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE videos RENAME COLUMN updated_at TO "updatedAt";

        ALTER TABLE resources RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE resources RENAME COLUMN updated_at TO "updatedAt";

        ALTER TABLE enrollments RENAME COLUMN cohort_id TO "courseId";
        ALTER TABLE enrollments RENAME COLUMN user_id TO "userId";
        ALTER TABLE enrollments RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE enrollments RENAME COLUMN updated_at TO "updatedAt";
        ALTER TABLE enrollments RENAME COLUMN deleted_at TO "deletedAt";

        ALTER TABLE enrollment_content_progress RENAME TO "enrollmentContentProgress";
        ALTER TABLE "enrollmentContentProgress" RENAME COLUMN enrollment_id TO "enrollmentId";
        ALTER TABLE "enrollmentContentProgress" RENAME COLUMN content_id TO "contentId";
        ALTER TABLE "enrollmentContentProgress" RENAME COLUMN module_id TO "moduleId";
        ALTER TABLE "enrollmentContentProgress" RENAME COLUMN watched_duration TO "watchedDuration";
        ALTER TABLE "enrollmentContentProgress" RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE "enrollmentContentProgress" RENAME COLUMN updated_at TO "updatedAt";

        ALTER TABLE announcements RENAME COLUMN body_html TO "bodyHtml";
        ALTER TABLE announcements RENAME COLUMN body_preview TO "bodyPreview";
        ALTER TABLE announcements RENAME COLUMN author_user_id TO "authorUserId";
        ALTER TABLE announcements RENAME COLUMN tenant_id TO "tenantId";
        ALTER TABLE announcements RENAME COLUMN image_url TO "imageUrl";
        ALTER TABLE announcements RENAME COLUMN expiry_at TO "expiryAt";
        ALTER TABLE announcements RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE announcements RENAME COLUMN updated_at TO "updatedAt";
        ALTER TABLE announcements RENAME COLUMN deleted_at TO "deletedAt";

        ALTER TABLE announcement_cohorts RENAME TO "announcementCourses";
        ALTER TABLE "announcementCourses" RENAME COLUMN announcement_id TO "announcementId";
        ALTER TABLE "announcementCourses" RENAME COLUMN cohort_id TO "courseId";
        ALTER TABLE "announcementCourses" RENAME COLUMN is_pinned TO "isPinned";
        ALTER TABLE "announcementCourses" RENAME COLUMN pinned_at TO "pinnedAt";
        ALTER TABLE "announcementCourses" RENAME COLUMN is_home TO "isHome";
        ALTER TABLE "announcementCourses" RENAME COLUMN attached_at TO "attachedAt";
        ALTER TABLE "announcementCourses" RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE "announcementCourses" RENAME COLUMN updated_at TO "updatedAt";
        ALTER TABLE "announcementCourses" RENAME COLUMN deleted_at TO "deletedAt";

        ALTER TABLE announcement_reads RENAME TO "announcementReads";
        ALTER TABLE "announcementReads" RENAME COLUMN announcement_course_id TO "announcementCourseId";
        ALTER TABLE "announcementReads" RENAME COLUMN user_id TO "userId";
        ALTER TABLE "announcementReads" RENAME COLUMN read_at TO "readAt";
        ALTER TABLE "announcementReads" RENAME COLUMN created_at TO "createdAt";
        ALTER TABLE "announcementReads" RENAME COLUMN updated_at TO "updatedAt";
      `, { transaction });

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS roles (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "userRoles" (
          id SERIAL PRIMARY KEY,
          "userId" INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
          "roleId" INTEGER NOT NULL REFERENCES roles(id) ON UPDATE CASCADE ON DELETE CASCADE,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("userId", "roleId")
        );

        CREATE TABLE IF NOT EXISTS "courseRoles" (
          id SERIAL PRIMARY KEY,
          "courseId" INTEGER NOT NULL REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
          "roleId" INTEGER NOT NULL REFERENCES roles(id) ON UPDATE CASCADE ON DELETE CASCADE,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("courseId", "roleId")
        );

        CREATE TABLE IF NOT EXISTS "contentAttachments" (
          id SERIAL PRIMARY KEY,
          "contentId" INTEGER NOT NULL REFERENCES contents(id) ON UPDATE CASCADE ON DELETE CASCADE,
          "resourceId" INTEGER NOT NULL REFERENCES resources(id) ON UPDATE CASCADE ON DELETE CASCADE,
          "sequenceNumber" INTEGER NOT NULL DEFAULT 1,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("contentId", "resourceId")
        );
      `, { transaction });

      await sequelize.query(`
        INSERT INTO roles (name)
        VALUES
          ('CHEF'),
          ('PRIEST'),
          ('TEMPLE_ADMIN'),
          ('VOLUNTEER'),
          ('BOOK_TABLE'),
          ('FESTIVAL_VOLUNTEER')
        ON CONFLICT (name) DO NOTHING;

        INSERT INTO "userRoles" ("userId", "roleId")
        SELECT u.id, r.id
        FROM users u
        JOIN roles r ON r.name = 'VOLUNTEER'
        ON CONFLICT ("userId", "roleId") DO NOTHING;

        INSERT INTO "courseRoles" ("courseId", "roleId")
        SELECT c.id, r.id
        FROM courses c
        JOIN roles r ON r.name = CASE
          WHEN c.title ILIKE '%kitchen%' OR c.title ILIKE '%prasadam%' THEN 'CHEF'
          WHEN c.title ILIKE '%puja%' OR c.title ILIKE '%altar%' THEN 'PRIEST'
          WHEN c.title ILIKE '%book%' THEN 'BOOK_TABLE'
          WHEN c.title ILIKE '%festival%' THEN 'FESTIVAL_VOLUNTEER'
          ELSE 'VOLUNTEER'
        END
        ON CONFLICT ("courseId", "roleId") DO NOTHING;
      `, { transaction });

      await sequelize.query(`
        ALTER TABLE courses
          ADD CONSTRAINT courses_tenant_fkey
          FOREIGN KEY ("tenantId") REFERENCES tenants(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;

        ALTER TABLE modules
          ADD CONSTRAINT modules_course_fkey
          FOREIGN KEY ("courseId") REFERENCES courses(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;

        ALTER TABLE contents
          ADD CONSTRAINT contents_module_fkey
          FOREIGN KEY ("moduleId") REFERENCES modules(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;

        ALTER TABLE enrollments
          ADD CONSTRAINT enrollments_course_fkey
          FOREIGN KEY ("courseId") REFERENCES courses(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;

        ALTER TABLE enrollments
          ADD CONSTRAINT enrollments_user_fkey
          FOREIGN KEY ("userId") REFERENCES users(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;

        ALTER TABLE "enrollmentContentProgress"
          ADD CONSTRAINT enrollment_progress_enrollment_fkey
          FOREIGN KEY ("enrollmentId") REFERENCES enrollments(id)
          ON UPDATE CASCADE ON DELETE CASCADE;

        ALTER TABLE "enrollmentContentProgress"
          ADD CONSTRAINT enrollment_progress_content_fkey
          FOREIGN KEY ("contentId") REFERENCES contents(id)
          ON UPDATE CASCADE ON DELETE CASCADE;

        ALTER TABLE "enrollmentContentProgress"
          ADD CONSTRAINT enrollment_progress_module_fkey
          FOREIGN KEY ("moduleId") REFERENCES modules(id)
          ON UPDATE CASCADE ON DELETE CASCADE;

        ALTER TABLE announcements
          ADD CONSTRAINT announcements_author_fkey
          FOREIGN KEY ("authorUserId") REFERENCES users(id)
          ON UPDATE CASCADE ON DELETE SET NULL;

        ALTER TABLE announcements
          ADD CONSTRAINT announcements_tenant_fkey
          FOREIGN KEY ("tenantId") REFERENCES tenants(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;

        ALTER TABLE "announcementCourses"
          ADD CONSTRAINT announcement_courses_announcement_fkey
          FOREIGN KEY ("announcementId") REFERENCES announcements(id)
          ON UPDATE CASCADE ON DELETE CASCADE;

        ALTER TABLE "announcementCourses"
          ADD CONSTRAINT announcement_courses_course_fkey
          FOREIGN KEY ("courseId") REFERENCES courses(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;

        ALTER TABLE "announcementReads"
          ADD CONSTRAINT announcement_reads_announcement_course_fkey
          FOREIGN KEY ("announcementCourseId") REFERENCES "announcementCourses"(id)
          ON UPDATE CASCADE ON DELETE CASCADE;

        ALTER TABLE "announcementReads"
          ADD CONSTRAINT announcement_reads_user_fkey
          FOREIGN KEY ("userId") REFERENCES users(id)
          ON UPDATE CASCADE ON DELETE CASCADE;
      `, { transaction });

      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS tenants_domain_key ON tenants(domain);
        CREATE INDEX IF NOT EXISTS idx_courses_tenant ON courses("tenantId");
        CREATE UNIQUE INDEX IF NOT EXISTS idx_modules_course_sequence ON modules("courseId", "sequenceNumber") WHERE "deletedAt" IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_contents_module_sequence ON contents("moduleId", "sequenceNumber") WHERE "deletedAt" IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_course_user ON enrollments("courseId", "userId") WHERE "deletedAt" IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_progress_unique ON "enrollmentContentProgress"("enrollmentId", "contentId");
        CREATE UNIQUE INDEX IF NOT EXISTS idx_announcement_courses_unique ON "announcementCourses"("announcementId", "courseId") WHERE "deletedAt" IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_announcement_reads_unique ON "announcementReads"("announcementCourseId", "userId");
        CREATE INDEX IF NOT EXISTS idx_videos_external_id ON videos("externalVideoId");
      `, { transaction });
    });
  },

  async down() {
    throw new Error('This schema finalization migration is intentionally one-way.');
  }
};
