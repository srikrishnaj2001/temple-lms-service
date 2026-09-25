'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Check if table already exists
      const tableExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.forms') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!tableExists[0].exists) {
        await queryInterface.createTable('forms', {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER
          },
          course_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'courses',
              key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          form_type: {
            type: Sequelize.ENUM('ONBOARDING', 'MID_FEEDBACK', 'OFFBOARDING'),
            allowNull: false
          },
          trigger_date: {
            type: 'TIMESTAMPTZ',
            allowNull: false
          },
          is_enabled: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true
          },
          created_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        }, { transaction });
      }

      // Add index for course_id lookups (if not exists)
      const indexExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.idx_forms_course') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!indexExists[0].exists) {
        await queryInterface.addIndex('forms', ['course_id'], {
          name: 'idx_forms_course',
          transaction
        });
      }

      // Add unique constraint for course + form_type combination (if not exists)
      const constraintExists = await queryInterface.sequelize.query(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_name = 'forms' AND constraint_name = 'forms_course_type_unique'`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (constraintExists.length === 0) {
        await queryInterface.addConstraint('forms', {
          fields: ['course_id', 'form_type'],
          type: 'unique',
          name: 'forms_course_type_unique',
          transaction
        });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const tableExists = await queryInterface.tableExists('forms');
      if (tableExists) {
        await queryInterface.dropTable('forms', { transaction });
      }

      // Drop the ENUM type
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_forms_form_type";',
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
