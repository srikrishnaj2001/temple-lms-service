'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Check if table already exists
      const tableExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.form_questions') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!tableExists[0].exists) {
        await queryInterface.createTable('form_questions', {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER
          },
          form_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'forms',
              key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          question: {
            type: Sequelize.TEXT,
            allowNull: false
          },
          type: {
            type: Sequelize.ENUM('INPUT', 'SELECT', 'MULTISELECT'),
            allowNull: false
          },
          options: {
            type: Sequelize.JSONB,
            allowNull: true,
            comment: 'Array of options for SELECT/MULTISELECT types, e.g., ["1","2","3","4","5"] for ratings'
          },
          sequence_number: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
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

      // Add index for form_id lookups (if not exists)
      const indexExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.idx_form_questions_form') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!indexExists[0].exists) {
        await queryInterface.addIndex('form_questions', ['form_id'], {
          name: 'idx_form_questions_form',
          transaction
        });
      }

      // Add index for ordering by sequence (if not exists)
      const sequenceIndexExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.idx_form_questions_form_sequence') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!sequenceIndexExists[0].exists) {
        await queryInterface.addIndex('form_questions', ['form_id', 'sequence_number'], {
          name: 'idx_form_questions_form_sequence',
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
      const tableExists = await queryInterface.tableExists('form_questions');
      if (tableExists) {
        await queryInterface.dropTable('form_questions', { transaction });
      }

      // Drop the ENUM type
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_form_questions_type";',
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
