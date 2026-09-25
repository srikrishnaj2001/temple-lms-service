'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Check if table already exists
      const tableExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.form_responses') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!tableExists[0].exists) {
        await queryInterface.createTable('form_responses', {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER
          },
          form_question_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'form_questions',
              key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          enrollment_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'enrollments',
              key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          response: {
            type: Sequelize.TEXT,
            allowNull: false,
            comment: 'User response - text for INPUT, selected value for SELECT, JSON array for MULTISELECT'
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

      // Add unique constraint for enrollment + question combination (if not exists)
      const constraintExists = await queryInterface.sequelize.query(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_name = 'form_responses' AND constraint_name = 'form_responses_question_enrollment_unique'`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (constraintExists.length === 0) {
        await queryInterface.addConstraint('form_responses', {
          fields: ['form_question_id', 'enrollment_id'],
          type: 'unique',
          name: 'form_responses_question_enrollment_unique',
          transaction
        });
      }

      // Add index for enrollment_id lookups (if not exists)
      const enrollmentIndexExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.idx_form_responses_enrollment') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!enrollmentIndexExists[0].exists) {
        await queryInterface.addIndex('form_responses', ['enrollment_id'], {
          name: 'idx_form_responses_enrollment',
          transaction
        });
      }

      // Add index for form_question_id lookups (if not exists)
      const questionIndexExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.idx_form_responses_question') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!questionIndexExists[0].exists) {
        await queryInterface.addIndex('form_responses', ['form_question_id'], {
          name: 'idx_form_responses_question',
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
      const tableExists = await queryInterface.tableExists('form_responses');
      if (tableExists) {
        await queryInterface.dropTable('form_responses', { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
