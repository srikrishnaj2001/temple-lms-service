'use strict';
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE roles ALTER COLUMN name TYPE VARCHAR(100) USING name::text');
  },
  async down() {
    throw new Error('Cannot narrow roles to the old enum without removing custom roles.');
  },
};
