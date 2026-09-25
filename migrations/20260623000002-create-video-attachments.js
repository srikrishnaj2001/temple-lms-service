'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('video_attachments', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      video_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'videos',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      content_type: {
        type: Sequelize.ENUM('RESOURCE', 'ASSIGNMENT'),
        allowNull: false
      },
      content_id: {
        type: Sequelize.INTEGER,
        allowNull: false
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

    // Additional indexes (video_id index is auto-created by the FK)
    await queryInterface.addIndex('video_attachments', ['video_id', 'content_type', 'sequence_number'], {
      name: 'idx_video_attachments_video_type_seq'
    });
    await queryInterface.addIndex('video_attachments', ['video_id', 'content_type', 'content_id'], {
      name: 'idx_video_attachments_unique',
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('video_attachments');
  }
};
