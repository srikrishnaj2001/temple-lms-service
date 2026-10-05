'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class QuizOption extends Model {}

  QuizOption.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    questionId: {
      type: DataTypes.INTEGER,
      field: 'question_id',
      allowNull: false,
      references: { model: 'quiz_questions', key: 'id' },
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    isCorrect: {
      type: DataTypes.BOOLEAN,
      field: 'is_correct',
      allowNull: false,
      defaultValue: false,
    },
    sequenceNumber: {
      type: DataTypes.INTEGER,
      field: 'sequence_number',
      allowNull: false,
      defaultValue: 1,
    },
  }, {
    sequelize,
    modelName: 'QuizOption',
    tableName: 'quiz_options',
    underscored: true,
  });

  return QuizOption;
};
