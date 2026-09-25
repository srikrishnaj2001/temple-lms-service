'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable('content_links', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        source_content_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'contents',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
          comment: 'The parent content (e.g., a video)'
        },
        linked_content_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'contents',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
          comment: 'The linked content (e.g., a resource or assignment)'
        },
        link_type: {
          type: Sequelize.ENUM('RESOURCE', 'ASSIGNMENT', 'RELATED'),
          allowNull: false,
          defaultValue: 'RELATED',
          comment: 'Type of link relationship'
        },
        sequence_number: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: 'Order of linked content within same link_type'
        },
        created_at: {
          allowNull: false,
          type: 'TIMESTAMPTZ',
          defaultValue: Sequelize.literal('NOW()')
        },
        updated_at: {
          allowNull: false,
          type: 'TIMESTAMPTZ',
          defaultValue: Sequelize.literal('NOW()')
        }
      }, { transaction });

      // Add unique constraint to prevent duplicate links
      await queryInterface.addConstraint('content_links', {
        fields: ['source_content_id', 'linked_content_id'],
        type: 'unique',
        name: 'content_links_unique_pair',
        transaction
      });

      // Add index for efficient lookup of linked content by source
      await queryInterface.sequelize.query(
        'CREATE INDEX IF NOT EXISTS "idx_content_links_source_type_seq" ON "content_links" ("source_content_id", "link_type", "sequence_number")',
        { transaction }
      );

      // Add index for reverse lookup (find what links to a content)
      await queryInterface.sequelize.query(
        'CREATE INDEX IF NOT EXISTS "idx_content_links_linked" ON "content_links" ("linked_content_id")',
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const tableExists = await queryInterface.tableExists('content_links');
      if (tableExists) {
        await queryInterface.dropTable('content_links', { transaction });
      }

      // Drop the ENUM type if it exists
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_content_links_link_type";',
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
