'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Module extends Model {
  }

  Module.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    courseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'courses',
        key: 'id'
      }
    },
    startDate: {
      type: 'TIMESTAMPTZ',
      allowNull: false,
    },
    endDate: {
      type: 'TIMESTAMPTZ',
      allowNull: true,
    },
    sequenceNumber: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Module',
    tableName: 'modules',
    paranoid: true, // Enables soft deletes
    indexes: [
      {
        name: 'idx_modules_course_sequence',
        fields: ['courseId', 'sequenceNumber']
      },
      {
        name: 'idx_modules_start_date',
        fields: ['startDate']
      },
      {
        name: 'idx_modules_course_id',
        fields: ['courseId']
      }
    ]
  });

  return Module;
};
