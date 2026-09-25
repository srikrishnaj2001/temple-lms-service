'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const tableExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.announcement_courses') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!tableExists[0].exists) {
        await queryInterface.createTable('announcement_courses', {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()')
          },
          announcement_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'announcements', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          course_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'courses', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          is_pinned: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
          },
          pinned_at: {
            type: 'TIMESTAMPTZ',
            allowNull: true
          },
          is_home: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
          },
          attached_at: {
            type: 'TIMESTAMPTZ',
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          created_at: {
            type: 'TIMESTAMPTZ',
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: 'TIMESTAMPTZ',
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          deleted_at: {
            type: 'TIMESTAMPTZ',
            allowNull: true
          }
        }, { transaction });

        // One live row per (announcement, course)
        await queryInterface.sequelize.query(
          `CREATE UNIQUE INDEX idx_announcement_courses_unique_live
           ON announcement_courses (announcement_id, course_id)
           WHERE deleted_at IS NULL`,
          { transaction }
        );

        // Pin-cap support: count pinned rows per course quickly
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_announcement_courses_pinned
           ON announcement_courses (course_id)
           WHERE is_pinned = true AND deleted_at IS NULL`,
          { transaction }
        );

        // Per-board feed ordering
        await queryInterface.sequelize.query(
          `CREATE INDEX idx_announcement_courses_board_feed
           ON announcement_courses (course_id, attached_at DESC)
           WHERE deleted_at IS NULL`,
          { transaction }
        );
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('announcement_courses', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
