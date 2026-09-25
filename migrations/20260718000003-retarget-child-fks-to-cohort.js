'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. enrollments: course_id → cohort_id
      await queryInterface.renameColumn('enrollments', 'course_id', 'cohort_id', { transaction });

      // 2. modules: course_id → cohort_id
      await queryInterface.renameColumn('modules', 'course_id', 'cohort_id', { transaction });

      // 3. forms: course_id → cohort_id + add tenant_id
      await queryInterface.renameColumn('forms', 'course_id', 'cohort_id', { transaction });
      await queryInterface.addColumn('forms', 'tenant_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      }, { transaction });
      // Backfill forms.tenant_id from their cohort
      await queryInterface.sequelize.query(
        `UPDATE forms SET tenant_id = c.tenant_id FROM cohorts c WHERE c.id = forms.cohort_id`,
        { transaction }
      );

      // 4. course_tools → cohort_tools
      await queryInterface.renameTable('course_tools', 'cohort_tools', { transaction });
      await queryInterface.renameColumn('cohort_tools', 'course_id', 'cohort_id', { transaction });

      // 5. tools: add tenant_id
      await queryInterface.addColumn('tools', 'tenant_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      }, { transaction });
      // Backfill tools.tenant_id with iitpatna
      await queryInterface.sequelize.query(
        `UPDATE tools SET tenant_id = (SELECT id FROM tenants WHERE subdomain = 'iitpatna' LIMIT 1)`,
        { transaction }
      );

      // 6. community_links: course_id → cohort_id
      await queryInterface.renameColumn('community_links', 'course_id', 'cohort_id', { transaction });

      // 7. course_managers → cohort_managers
      await queryInterface.renameTable('course_managers', 'cohort_managers', { transaction });
      await queryInterface.renameColumn('cohort_managers', 'course_id', 'cohort_id', { transaction });

      // 8. announcements: add tenant_id
      await queryInterface.addColumn('announcements', 'tenant_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      }, { transaction });
      // Backfill announcements.tenant_id with iitpatna
      await queryInterface.sequelize.query(
        `UPDATE announcements SET tenant_id = (SELECT id FROM tenants WHERE subdomain = 'iitpatna' LIMIT 1)`,
        { transaction }
      );

      // 9. announcement_courses → announcement_cohorts
      await queryInterface.renameTable('announcement_courses', 'announcement_cohorts', { transaction });
      await queryInterface.renameColumn('announcement_cohorts', 'course_id', 'cohort_id', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Reverse in opposite order

      // 9. announcement_cohorts → announcement_courses
      await queryInterface.renameColumn('announcement_cohorts', 'cohort_id', 'course_id', { transaction });
      await queryInterface.renameTable('announcement_cohorts', 'announcement_courses', { transaction });

      // 8. Remove tenant_id from announcements
      await queryInterface.removeColumn('announcements', 'tenant_id', { transaction });

      // 7. cohort_managers → course_managers
      await queryInterface.renameColumn('cohort_managers', 'cohort_id', 'course_id', { transaction });
      await queryInterface.renameTable('cohort_managers', 'course_managers', { transaction });

      // 6. community_links: cohort_id → course_id
      await queryInterface.renameColumn('community_links', 'cohort_id', 'course_id', { transaction });

      // 5. Remove tenant_id from tools
      await queryInterface.removeColumn('tools', 'tenant_id', { transaction });

      // 4. cohort_tools → course_tools
      await queryInterface.renameColumn('cohort_tools', 'cohort_id', 'course_id', { transaction });
      await queryInterface.renameTable('cohort_tools', 'course_tools', { transaction });

      // 3. Remove tenant_id from forms, rename cohort_id → course_id
      await queryInterface.removeColumn('forms', 'tenant_id', { transaction });
      await queryInterface.renameColumn('forms', 'cohort_id', 'course_id', { transaction });

      // 2. modules: cohort_id → course_id
      await queryInterface.renameColumn('modules', 'cohort_id', 'course_id', { transaction });

      // 1. enrollments: cohort_id → course_id
      await queryInterface.renameColumn('enrollments', 'cohort_id', 'course_id', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
