'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('resources', 'extracted_text', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Text extracted from PDF via pdf-parse. Used by quizService to build LLM context.',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('resources', 'extracted_text');
  },
};
