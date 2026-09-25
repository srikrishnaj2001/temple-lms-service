'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Check if the unique index exists before trying to remove it
      const indexes = await queryInterface.showIndex('videos', { transaction });
      const uniqueIndexExists = indexes.some(index => 
        index.name === 'idx_videos_external_id' && index.unique === true
      );

      if (uniqueIndexExists) {
        // Remove the unique index
        await queryInterface.removeIndex('videos', 'idx_videos_external_id', { transaction });

        // Add back the same index but without unique constraint
        await queryInterface.addIndex('videos', ['external_video_id'], {
          name: 'idx_videos_external_id',
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
      // Remove the non-unique index
      try {
        await queryInterface.removeIndex('videos', 'idx_videos_external_id', { transaction });
      } catch (error) {
        // Index might not exist, continuing...
      }

      // Add back the unique index
      await queryInterface.addIndex('videos', ['external_video_id'], {
        name: 'idx_videos_external_id',
        unique: true,
        transaction
      });

      await transaction.commit();

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
