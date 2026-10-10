'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // ----- quizzes --------------------------------------------------------
      // Lesson-wise: one quiz attaches to one `contents` row (the lesson).
      await queryInterface.createTable('quizzes', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        content_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'contents', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        title: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        question_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 10,
        },
        difficulty: {
          type: Sequelize.ENUM('EASY', 'MEDIUM', 'HARD', 'MIXED'),
          allowNull: false,
          defaultValue: 'MIXED',
        },
        passing_score: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 70,
          comment: 'Percentage required to pass (0-100)',
        },
        require_pass_to_advance: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        show_explanations: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'Show per-question explanation after learner answers',
        },
        is_published: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'DRAFT (false) → not visible to learners. PUBLISHED (true) → live.',
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        deleted_at: {
          allowNull: true,
          type: Sequelize.DATE,
        },
      }, { transaction });

      // One quiz per content item (soft-delete friendly: multiple soft-deleted
      // rows ok, but at most one active quiz per lesson).
      await queryInterface.addIndex('quizzes', ['content_id'], {
        name: 'quizzes_content_id_idx',
        transaction,
      });

      // ----- quiz_questions -------------------------------------------------
      await queryInterface.createTable('quiz_questions', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        quiz_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'quizzes', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        prompt: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        explanation: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Shown to learner after they answer (if show_explanations=true)',
        },
        sequence_number: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('quiz_questions', ['quiz_id'], {
        name: 'quiz_questions_quiz_id_idx',
        transaction,
      });

      // ----- quiz_options ---------------------------------------------------
      await queryInterface.createTable('quiz_options', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        question_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'quiz_questions', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        text: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        is_correct: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        sequence_number: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('quiz_options', ['question_id'], {
        name: 'quiz_options_question_id_idx',
        transaction,
      });

      // ----- quiz_attempts --------------------------------------------------
      // Historical record of each learner's quiz attempt. Preserved even if
      // the quiz is unpublished or edited later.
      await queryInterface.createTable('quiz_attempts', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        quiz_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'quizzes', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        score_percent: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '0-100',
        },
        passed: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          comment: 'Computed server-side: score_percent >= quiz.passing_score',
        },
        answers: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
          comment: '{ "questionId": "selectedOptionId" } — frozen snapshot of learner choices',
        },
        completed_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('quiz_attempts', ['quiz_id', 'user_id'], {
        name: 'quiz_attempts_quiz_user_idx',
        transaction,
      });
      await queryInterface.addIndex('quiz_attempts', ['user_id'], {
        name: 'quiz_attempts_user_idx',
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Reverse order of creation (children before parents).
      await queryInterface.dropTable('quiz_attempts', { transaction });
      await queryInterface.dropTable('quiz_options', { transaction });
      await queryInterface.dropTable('quiz_questions', { transaction });
      await queryInterface.dropTable('quizzes', { transaction });

      // Drop the enum type explicitly — Postgres leaves it dangling otherwise.
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_quizzes_difficulty";',
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
