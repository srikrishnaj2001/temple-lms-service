'use strict';
// Column renames may retain the enum's original snake_case name.
module.exports = {
  async up(queryInterface) {
    const [columns] = await queryInterface.sequelize.query(`SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'contents' AND column_name = 'contentType'`);
    const enumName = queryInterface.queryGenerator.quoteIdentifier(columns[0].udt_name);
    await queryInterface.sequelize.query(`ALTER TYPE ${enumName} ADD VALUE IF NOT EXISTS 'AUDIO'`);
    await queryInterface.sequelize.query(`ALTER TYPE ${enumName} ADD VALUE IF NOT EXISTS 'READ'`);
  },
  async down() {},
};
