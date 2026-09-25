'use strict';

module.exports = {
  async up(queryInterface) {
    // Create the properly named unique index
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_modules_cohort_sequence_unique
      ON modules (cohort_id, sequence_number)
    `);

    // Drop the old constraint first (it owns the index), then the redundant indexes
    await queryInterface.sequelize.query(`ALTER TABLE modules DROP CONSTRAINT IF EXISTS modules_course_sequence_unique`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_modules_course_sequence`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_modules_course_id`);
  },

  async down(queryInterface) {
    // Restore old indexes
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX modules_course_sequence_unique ON modules (cohort_id, sequence_number)
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_modules_course_sequence ON modules (cohort_id, sequence_number)
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_modules_course_id ON modules (cohort_id)
    `);

    // Drop the new one
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_modules_cohort_sequence_unique`);
  }
};
