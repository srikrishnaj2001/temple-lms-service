'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class QuizQuestion extends Model {}

  QuizQuestion.init({
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
    prompt: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    explanation: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sequenceNumber: {
      type: DataTypes.INTEGER,
      field: 'sequence_number',
      allowNull: false,
      defaultValue: 1,
    },
  }, {
    sequelize,
    modelName: 'QuizQuestion',
    tableName: 'quiz_questions',
    underscored: true,
  });

  return QuizQuestion;
};
