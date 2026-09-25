'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const tableExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.announcement_reads') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!tableExists[0].exists) {
        await queryInterface.createTable('announcement_reads', {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()')
          },
          announcement_course_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'announcement_courses', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          read_at: {
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
          }
        }, { transaction });

        await queryInterface.addIndex('announcement_reads', ['announcement_course_id', 'user_id'], {
          name: 'idx_announcement_reads_unique',
          unique: true,
          transaction
        });
        await queryInterface.addIndex('announcement_reads', ['user_id'], {
          name: 'idx_announcement_reads_user',
          transaction
        });
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
      await queryInterface.dropTable('announcement_reads', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
