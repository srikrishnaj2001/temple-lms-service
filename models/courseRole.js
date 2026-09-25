'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CourseRole extends Model {}

  CourseRole.init({
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
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'CourseRole',
    tableName: 'courseRoles',
    indexes: [
      { name: 'idx_course_roles_unique', unique: true, fields: ['courseId', 'roleId'] }
    ]
  });

  return CourseRole;
};
