'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.createTable('enrollment_content_progress', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        enrollment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'enrollments',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        content_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'contents',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        module_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'modules',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        status: {
          type: Sequelize.ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'),
          allowNull: false,
          defaultValue: 'NOT_STARTED'
        },
        created_at: {
          allowNull: false,
          type: 'TIMESTAMPTZ',
          defaultValue: Sequelize.literal('NOW()')
        },
        updated_at: {
          allowNull: false,
          type: 'TIMESTAMPTZ',
          defaultValue: Sequelize.literal('NOW()')
        }
      }, { transaction });

      // Add unique constraint for enrollment_id + content_id combination
      await queryInterface.addConstraint('enrollment_content_progress', {
        fields: ['enrollment_id', 'content_id'],
        type: 'unique',
        name: 'enrollment_content_progress_unique',
        transaction
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      const tableExists = await queryInterface.tableExists('enrollment_content_progress');
      if (tableExists) {
        await queryInterface.dropTable('enrollment_content_progress', { transaction });
      }
      
      // Drop the ENUM type if it exists
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_enrollment_content_progress_status";',
        { transaction }
      );
      
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
