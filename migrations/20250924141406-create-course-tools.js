'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('course_tools', {
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
        onDelete: 'CASCADE'
      },
      tool_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'tools',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add unique constraint to prevent duplicate course-tool associations
    await queryInterface.addConstraint('course_tools', {
      fields: ['course_id', 'tool_id'],
      type: 'unique',
      name: 'unique_course_tool'
    });

    // Add indexes for better performance
    await queryInterface.addIndex('course_tools', ['course_id']);
    await queryInterface.addIndex('course_tools', ['tool_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('course_tools');
  }
};
