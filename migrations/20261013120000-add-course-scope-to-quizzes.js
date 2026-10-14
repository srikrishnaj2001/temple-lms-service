'use strict';

/**
 * Extend the lesson-wise quizzes schema with a parallel course-wide scope:
 * each quiz now attaches to EITHER one lesson (`content_id`) OR one course
 * (`course_id`), never both. Course-scoped quizzes are the "final assessment"
 * for a course and aggregate text from every lesson under it.
 *
 * Backward compat: existing rows all have `content_id` set + `course_id` null,
 * which satisfies the new CHECK constraint without a backfill.
 *
 * Reversible: `down()` drops the constraint, index, column, and restores
 * `content_id NOT NULL`. If any course-scoped quizzes exist at that point
 * the down migration will fail on the NOT NULL change (correct — we don't
 * want to silently lose data).
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Add nullable course_id FK.
      await queryInterface.addColumn(
        'quizzes',
        'course_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'courses', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        { transaction }
      );

      // 2. Allow content_id to be null so a quiz can be course-scoped.
      //    Direct DDL — queryInterface.changeColumn in sequelize 6 silently
      //    skips the nullability change when the column already has a FK,
      //    which left the CHECK constraint impossible to satisfy. Raw SQL
      //    is correct and safe here (no data rewrite, just metadata).
      await queryInterface.sequelize.query(
        'ALTER TABLE quizzes ALTER COLUMN content_id DROP NOT NULL',
        { transaction }
      );

      // 3. CHECK constraint — exactly one of content_id / course_id is set.
      //    Prevents accidental creation of a "both" or "neither" quiz row.
      await queryInterface.sequelize.query(
        `ALTER TABLE quizzes
         ADD CONSTRAINT quizzes_scope_chk
         CHECK (
           (content_id IS NULL) <> (course_id IS NULL)
         )`,
        { transaction }
      );

      // 4. One active quiz per course. Partial unique index excludes
      //    soft-deleted rows so paranoid delete + re-create flow still works.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX quizzes_course_id_unique_active
         ON quizzes (course_id)
         WHERE course_id IS NOT NULL AND deleted_at IS NULL`,
        { transaction }
      );

      // 5. Index for the admin list page's course-scoped lookups.
      await queryInterface.addIndex('quizzes', ['course_id'], {
        name: 'quizzes_course_id_idx',
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex('quizzes', 'quizzes_course_id_idx', { transaction });
      await queryInterface.sequelize.query(
        'DROP INDEX IF EXISTS quizzes_course_id_unique_active',
        { transaction }
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_scope_chk',
        { transaction }
      );
      // Restore the original NOT NULL on content_id. Fails loudly if any
      // course-scoped quizzes still exist (NULL content_id rows) — operator
      // must delete those first before reverting the schema.
      await queryInterface.sequelize.query(
        'ALTER TABLE quizzes ALTER COLUMN content_id SET NOT NULL',
        { transaction }
      );
      await queryInterface.removeColumn('quizzes', 'course_id', { transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
