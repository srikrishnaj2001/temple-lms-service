'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.createTable('course_managers', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
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
        type: {
          type: Sequelize.ENUM('COURSE_MANAGER', 'INSTRUCTOR'),
          allowNull: false
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
        },
        deleted_at: {
          allowNull: true,
          type: Sequelize.DATE
        }
      }, { transaction });

      // Add unique constraint for user + course + type combination
      await queryInterface.addConstraint('course_managers', {
        fields: ['user_id', 'course_id', 'type'],
        type: 'unique',
        name: 'course_managers_user_course_type_unique',
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
      const tableExists = await queryInterface.tableExists('course_managers');
      if (tableExists) {
        await queryInterface.dropTable('course_managers', { transaction });
      }
      
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};