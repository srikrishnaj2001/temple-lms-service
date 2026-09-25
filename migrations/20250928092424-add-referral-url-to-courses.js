'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Check if column already exists before adding
    const tableDescription = await queryInterface.describeTable('courses');
    
    if (!tableDescription.referral_url) {
      await queryInterface.addColumn('courses', 'referral_url', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Optional referral URL for the course'
      });
    }
  },
  async down (queryInterface, Sequelize) {
    // Check if column exists before removing
    const tableDescription = await queryInterface.describeTable('courses');
    
    if (tableDescription.referral_url) {
      await queryInterface.removeColumn('courses', 'referral_url');
    }
  }
};
