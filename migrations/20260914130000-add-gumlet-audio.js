'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('audios', 'external_audio_id', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.changeColumn('audios', 'url', { type: Sequelize.STRING(2048), allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('audios', 'external_audio_id');
  },
};
