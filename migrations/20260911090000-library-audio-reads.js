'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const [columns] = await queryInterface.sequelize.query(`SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'contents' AND column_name = 'contentType'`);
    const enumName = queryInterface.queryGenerator.quoteIdentifier(columns[0].udt_name);
    await queryInterface.sequelize.query(`ALTER TYPE ${enumName} ADD VALUE IF NOT EXISTS 'AUDIO'`);
    await queryInterface.sequelize.query(`ALTER TYPE ${enumName} ADD VALUE IF NOT EXISTS 'READ'`);
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of ['audios', 'reads']) {
        await queryInterface.createTable(table, {
          id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
          title: { type: Sequelize.STRING, allowNull: false },
          description: { type: Sequelize.TEXT },
          summary: { type: Sequelize.TEXT },
          external_resources: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
          ...(table === 'audios' ? {
            url: { type: Sequelize.STRING(2048), allowNull: false },
            duration_ms: { type: Sequelize.INTEGER },
            transcript: { type: Sequelize.TEXT },
          } : { body: { type: Sequelize.TEXT, allowNull: false } }),
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        }, { transaction });
      }
      await queryInterface.addColumn('videos', 'transcript', { type: Sequelize.TEXT }, { transaction });
      await queryInterface.addColumn('resources', 'summary', { type: Sequelize.TEXT }, { transaction });
      for (const table of ['videos', 'resources']) {
        await queryInterface.addColumn(table, 'external_resources', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] }, { transaction });
      }
    });
  },
  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(`SELECT id FROM contents WHERE "contentType" IN ('AUDIO', 'READ') LIMIT 1`);
    if (rows.length) throw new Error('Remove audio/read placements before rolling back this migration.');
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('audios', { transaction });
      await queryInterface.dropTable('reads', { transaction });
      await queryInterface.removeColumn('videos', 'transcript', { transaction });
      await queryInterface.removeColumn('resources', 'summary', { transaction });
      for (const table of ['videos', 'resources']) await queryInterface.removeColumn(table, 'external_resources', { transaction });
    });
  },
};
