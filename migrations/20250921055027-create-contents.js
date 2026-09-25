'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.createTable('contents', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        content_id: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        content_type: {
          type: Sequelize.ENUM('VIDEO', 'RESOURCE', 'ASSIGNMENT', 'EVENT'),
          allowNull: false
        },
        sequence_number: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        start_date: {
          type: 'TIMESTAMPTZ',
          allowNull: false,
        },
        module_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'modules',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        deleted_at: {
          allowNull: true,
          type: Sequelize.DATE
        }
      }, { transaction });

      // Add unique constraint for sequence_number per module
      await queryInterface.addConstraint('contents', {
        fields: ['module_id', 'sequence_number'],
        type: 'unique',
        name: 'contents_module_sequence_unique',
        transaction
      });

      // Note: Polymorphic reference validation will be handled at the application level
      // PostgreSQL doesn't support subqueries in CHECK constraints

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      const tableExists = await queryInterface.tableExists('contents');
      if (tableExists) {
        await queryInterface.dropTable('contents', { transaction });
      }
      
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};