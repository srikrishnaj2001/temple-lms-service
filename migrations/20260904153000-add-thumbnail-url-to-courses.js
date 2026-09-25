'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addIfMissing = async (tableName) => {
      const table = await queryInterface.describeTable(tableName);
      if (!table.thumbnail_url) {
        await queryInterface.addColumn(tableName, 'thumbnail_url', {
          type: Sequelize.STRING(2048),
          allowNull: true
        });
      }
    };

    await addIfMissing('cohorts');
    await addIfMissing('courses');
  },

  async down(queryInterface) {
    const removeIfPresent = async (tableName) => {
      const table = await queryInterface.describeTable(tableName);
      if (table.thumbnail_url) {
        await queryInterface.removeColumn(tableName, 'thumbnail_url');
      }
    };

    await removeIfPresent('cohorts');
    await removeIfPresent('courses');
  }
};
