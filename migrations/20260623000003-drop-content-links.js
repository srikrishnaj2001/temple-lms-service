'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.dropTable('content_links');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_content_links_link_type";');
  },

  async down(queryInterface, Sequelize) {
    // Recreate the table if we need to rollback
    await queryInterface.createTable('content_links', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      source_content_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'contents', key: 'id' }
      },
      linked_content_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'contents', key: 'id' }
      },
      link_type: {
        type: Sequelize.ENUM('RESOURCE', 'ASSIGNMENT', 'RELATED'),
        allowNull: false,
        defaultValue: 'RELATED'
      },
      sequence_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
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
    });
  }
};
