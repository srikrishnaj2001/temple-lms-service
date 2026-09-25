'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EnrollmentContentProgress extends Model {
  }

  EnrollmentContentProgress.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    enrollmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'enrollments',
        key: 'id'
      }
    },
    contentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'contents',
        key: 'id'
      }
    },
    moduleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'modules',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'),
      allowNull: false,
      defaultValue: 'NOT_STARTED',
      validate: {
        isIn: [['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']]
      }
    },
    watchedDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: 'Max seconds watched by the user, used to restore seek position'
    }
  }, {
    sequelize,
    modelName: 'EnrollmentContentProgress',
    tableName: 'enrollmentContentProgress',
    timestamps: true,
    indexes: [
      {
        name: 'idx_enrollment_content_progress_enrollment',
        fields: ['enrollmentId']
      },
      {
        name: 'idx_enrollment_content_progress_content',
        fields: ['contentId']
      },
      {
        name: 'idx_enrollment_content_progress_module',
        fields: ['moduleId']
      },
      {
        name: 'idx_enrollment_content_progress_status',
        fields: ['status']
      },
      {
        name: 'idx_enrollment_content_progress_unique',
        unique: true,
        fields: ['enrollmentId', 'contentId']
      }
    ]
  });

  return EnrollmentContentProgress;
};
