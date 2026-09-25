'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CourseCategory extends Model {}

  CourseCategory.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    courseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'courses',
        key: 'id'
      }
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'categories',
        key: 'id'
      }
    },
    sequenceNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'CourseCategory',
    tableName: 'courseCategories',
    indexes: [
      { name: 'idx_course_categories_unique', unique: true, fields: ['courseId', 'categoryId'] },
      { name: 'idx_course_categories_category', fields: ['categoryId'] }
    ]
  });

  return CourseCategory;
};
