'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Quiz extends Model {}

  Quiz.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    contentId: {
      type: DataTypes.INTEGER,
      field: 'content_id',
      allowNull: false,
      references: { model: 'contents', key: 'id' },
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    questionCount: {
      type: DataTypes.INTEGER,
      field: 'question_count',
      allowNull: false,
      defaultValue: 10,
    },
    difficulty: {
      type: DataTypes.ENUM('EASY', 'MEDIUM', 'HARD', 'MIXED'),
      allowNull: false,
      defaultValue: 'MIXED',
    },
    passingScore: {
      type: DataTypes.INTEGER,
      field: 'passing_score',
      allowNull: false,
      defaultValue: 70,
    },
    requirePassToAdvance: {
      type: DataTypes.BOOLEAN,
      field: 'require_pass_to_advance',
      allowNull: false,
      defaultValue: false,
    },
    showExplanations: {
      type: DataTypes.BOOLEAN,
      field: 'show_explanations',
      allowNull: false,
      defaultValue: true,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      field: 'is_published',
      allowNull: false,
      defaultValue: false,
    },
  }, {
    sequelize,
    modelName: 'Quiz',
    tableName: 'quizzes',
    paranoid: true, // soft delete via deleted_at
    underscored: true, // created_at / updated_at / deleted_at column names
  });

  return Quiz;
};
