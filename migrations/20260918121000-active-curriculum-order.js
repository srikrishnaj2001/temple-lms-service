'use strict';
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      // Legacy unconditional indexes reserve positions even after a soft delete.
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_modules_cohort_sequence_unique', { transaction });
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_contents_module_sequence_unique', { transaction });
      await queryInterface.sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_modules_course_sequence ON modules ("courseId", "sequenceNumber") WHERE "deletedAt" IS NULL', { transaction });
      await queryInterface.sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_contents_active_sequence ON contents ("moduleId", "sequenceNumber") WHERE "deletedAt" IS NULL', { transaction });
    });
  },
  async down() { throw new Error('Restoring unconditional indexes may conflict with archived curriculum.'); },
};
