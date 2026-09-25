'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS video_attachments CASCADE;');
  },

  async down() {
    throw new Error('This migration is intentionally one-way.');
  }
};
