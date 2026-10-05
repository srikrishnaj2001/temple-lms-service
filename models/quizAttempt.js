'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class QuizAttempt extends Model {}

  QuizAttempt.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    quizId: {
      type: DataTypes.INTEGER,
      field: 'quiz_id',
      allowNull: false,
      references: { model: 'quizzes', key: 'id' },
    },
    userId: {
      type: DataTypes.INTEGER,
      field: 'user_id',
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    scorePercent: {
      type: DataTypes.INTEGER,
      field: 'score_percent',
      allowNull: false,
    },
    passed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    answers: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    completedAt: {
      type: DataTypes.DATE,
      field: 'completed_at',
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    sequelize,
    modelName: 'QuizAttempt',
    tableName: 'quiz_attempts',
    underscored: true,
  });

  return QuizAttempt;
};
