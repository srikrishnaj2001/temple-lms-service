'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('videos', 'summary', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'AI-generated HTML-formatted summary with key takeaways'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('videos', 'summary');
  }
};
