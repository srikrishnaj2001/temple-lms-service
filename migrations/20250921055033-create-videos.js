'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.createTable('videos', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        title: {
          type: Sequelize.STRING,
          allowNull: false
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        external_video_id: {
          type: Sequelize.STRING,
          allowNull: false
        },
        duration_ms: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: 'Video duration in milliseconds'
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

      // Add index for potential sorting/filtering by duration
      await queryInterface.addIndex('videos', ['duration_ms'], {
        name: 'videos_duration_ms_idx',
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
      const tableExists = await queryInterface.tableExists('videos');
      if (tableExists) {
        // Remove index first, then drop table
        try {
          await queryInterface.removeIndex('videos', 'videos_duration_ms_idx', { transaction });
        } catch (indexError) {
          // Index might not exist, continue with table drop
          console.log('Index videos_duration_ms_idx not found, continuing...');
        }
        await queryInterface.dropTable('videos', { transaction });
      }
      
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};