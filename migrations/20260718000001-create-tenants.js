'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable('tenants', {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.literal('gen_random_uuid()')
        },
        subdomain: {
          type: Sequelize.STRING(63),
          allowNull: false,
          unique: true
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        branding_config: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: {}
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
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

      // Seed the initial tenant
      await queryInterface.sequelize.query(
        `INSERT INTO tenants (id, subdomain, name, is_active, created_at, updated_at)
         VALUES (gen_random_uuid(), 'iitpatna', 'IIT Patna', true, NOW(), NOW())`,
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.dropTable('tenants', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
