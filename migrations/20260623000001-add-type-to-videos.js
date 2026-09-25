'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create the ENUM type if it doesn't already exist
    await queryInterface.sequelize.query(
      `DO $$ BEGIN
        CREATE TYPE "enum_videos_type" AS ENUM('PRE_RECORDED_CONTENT', 'Q&A_SESSION');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;`
    );

    // Add the column with default (skip if it already exists)
    const tableDesc = await queryInterface.describeTable('videos');
    if (!tableDesc.type) {
      await queryInterface.addColumn('videos', 'type', {
        type: Sequelize.ENUM('PRE_RECORDED_CONTENT', 'Q&A_SESSION'),
        allowNull: false,
        defaultValue: 'PRE_RECORDED_CONTENT',
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('videos', 'type');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_videos_type";');
  },
};
