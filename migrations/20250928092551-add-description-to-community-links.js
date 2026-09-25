'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Check if column already exists before adding
    const tableDescription = await queryInterface.describeTable('community_links');
    
    if (!tableDescription.description) {
      await queryInterface.addColumn('community_links', 'description', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Optional description for the community link'
      });
    }
  },

  async down (queryInterface, Sequelize) {
    // Check if column exists before removing
    const tableDescription = await queryInterface.describeTable('community_links');
    
    if (tableDescription.description) {
      await queryInterface.removeColumn('community_links', 'description');
    }
  }
};
