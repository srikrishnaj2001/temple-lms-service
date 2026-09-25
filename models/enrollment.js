'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Enrollment extends Model {
  }

  Enrollment.init({
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
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    lastAccessedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Enrollment',
    tableName: 'enrollments',
    paranoid: true, // Enables soft deletes
    indexes: [
      {
        name: 'idx_enrollments_user',
        fields: ['userId']
      },
      {
        name: 'idx_enrollments_course',
        fields: ['courseId']
      },
      {
        name: 'idx_enrollments_user_course',
        fields: ['userId', 'courseId']
      }
    ]
  });

  return Enrollment;
};
