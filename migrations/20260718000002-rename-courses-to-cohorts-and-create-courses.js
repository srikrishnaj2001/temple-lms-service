'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Rename courses → cohorts
      await queryInterface.renameTable('courses', 'cohorts', { transaction });

      // 2. Add tenant_id to cohorts (nullable first, then backfill, then NOT NULL)
      await queryInterface.addColumn('cohorts', 'tenant_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      }, { transaction });

      // Backfill tenant_id with the iitpatna tenant
      await queryInterface.sequelize.query(
        `UPDATE cohorts SET tenant_id = (SELECT id FROM tenants WHERE subdomain = 'iitpatna' LIMIT 1)`,
        { transaction }
      );

      // Set NOT NULL
      await queryInterface.changeColumn('cohorts', 'tenant_id', {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      }, { transaction });

      // Add index on tenant_id
      await queryInterface.addIndex('cohorts', ['tenant_id'], {
        name: 'idx_cohorts_tenant_id',
        transaction
      });

      // 3. Create new courses table (catalog entity)
      await queryInterface.createTable('courses', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        title: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        tenant_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tenants', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        cloned_from_course_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'courses', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        created_at: {
          type: 'TIMESTAMPTZ',
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: 'TIMESTAMPTZ',
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      // 4. Add course_id to cohorts
      await queryInterface.addColumn('cohorts', 'course_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'courses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction });

      // 5. Backfill: create a course row for each cohort, then link them
      await queryInterface.sequelize.query(
        `INSERT INTO courses (title, description, tenant_id, created_at, updated_at)
         SELECT title, description, tenant_id, NOW(), NOW() FROM cohorts`,
        { transaction }
      );

      // Link cohorts to their corresponding courses (match by title + tenant_id)
      await queryInterface.sequelize.query(
        `UPDATE cohorts SET course_id = c.id
         FROM courses c
         WHERE c.title = cohorts.title AND c.tenant_id = cohorts.tenant_id`,
        { transaction }
      );

      // Fix auto-increment sequences after data backfill
      await queryInterface.sequelize.query(
        `SELECT setval(pg_get_serial_sequence('cohorts', 'id'), (SELECT COALESCE(MAX(id), 1) FROM cohorts), true)`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `SELECT setval(pg_get_serial_sequence('courses', 'id'), (SELECT COALESCE(MAX(id), 1) FROM courses), true)`,
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove course_id from cohorts
      await queryInterface.removeColumn('cohorts', 'course_id', { transaction });

      // Drop the new courses table
      await queryInterface.dropTable('courses', { transaction });

      // Remove tenant_id index and column from cohorts
      await queryInterface.removeIndex('cohorts', 'idx_cohorts_tenant_id', { transaction });
      await queryInterface.removeColumn('cohorts', 'tenant_id', { transaction });

      // Rename cohorts back to courses
      await queryInterface.renameTable('cohorts', 'courses', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
