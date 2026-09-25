'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('announcements', 'image_url', {
      type: Sequelize.STRING(2048),
      allowNull: true,
      after: 'body_preview'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('announcements', 'image_url');
  }
};
