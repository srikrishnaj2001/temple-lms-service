'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('audios', 'thumbnail_url', { type: Sequelize.STRING(2048), allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('audios', 'thumbnail_url');
  }
};
