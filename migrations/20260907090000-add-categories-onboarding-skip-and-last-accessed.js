'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    await sequelize.transaction(async (transaction) => {
      const users = await queryInterface.describeTable('users');
      if (!users.onboardingSkipped) {
        await queryInterface.addColumn('users', 'onboardingSkipped', {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        }, { transaction });
      }
      if (users.phone && users.phone.allowNull === false) {
        await queryInterface.changeColumn('users', 'phone', {
          type: Sequelize.STRING,
          allowNull: true
        }, { transaction });
      }

      const enrollments = await queryInterface.describeTable('enrollments');
      if (!enrollments.lastAccessedAt) {
        await queryInterface.addColumn('enrollments', 'lastAccessedAt', {
          type: Sequelize.DATE,
          allowNull: true
        }, { transaction });
      }

      await queryInterface.createTable('categories', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        name: {
          type: Sequelize.STRING(120),
          allowNull: false,
          unique: true
        },
        slug: {
          type: Sequelize.STRING(140),
          allowNull: false,
          unique: true
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        sequenceNumber: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      await queryInterface.createTable('courseCategories', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        courseId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'courses',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        categoryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'categories',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        sequenceNumber: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_course_categories_unique
        ON "courseCategories" ("courseId", "categoryId");

        CREATE INDEX IF NOT EXISTS idx_course_categories_category
        ON "courseCategories" ("categoryId");
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('courseCategories');
    await queryInterface.dropTable('categories');
    await queryInterface.removeColumn('enrollments', 'lastAccessedAt');
    await queryInterface.removeColumn('users', 'onboardingSkipped');
  }
};
