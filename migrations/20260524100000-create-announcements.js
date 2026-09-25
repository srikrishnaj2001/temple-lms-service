'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const tableExists = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.announcements') IS NOT NULL as exists`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!tableExists[0].exists) {
        await queryInterface.createTable('announcements', {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.literal('gen_random_uuid()')
          },
          title: {
            type: Sequelize.STRING(150),
            allowNull: false
          },
          body_html: {
            type: Sequelize.TEXT,
            allowNull: false
          },
          body_preview: {
            type: Sequelize.STRING(280),
            allowNull: false
          },
          author_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          expiry_at: {
            type: Sequelize.DATEONLY,
            allowNull: true
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

        await queryInterface.addIndex('announcements', ['deleted_at', 'expiry_at'], {
          name: 'idx_announcements_active_set',
          transaction
        });
        await queryInterface.addIndex('announcements', ['created_at'], {
          name: 'idx_announcements_created_at',
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
      await queryInterface.dropTable('announcements', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
