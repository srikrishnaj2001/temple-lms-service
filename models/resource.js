'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Resource extends Model {
  }

  Resource.init({
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
    summary: { type: DataTypes.TEXT, allowNull: true },
    externalResources: { type: DataTypes.JSONB, field: 'external_resources', allowNull: false, defaultValue: [] },
    url: {
      type: DataTypes.STRING,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM('PDF', 'IMAGE', 'URL', 'TEXT'),
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Resource',
    tableName: 'resources',
    indexes: [
      {
        name: 'idx_resources_type',
        fields: ['type']
      },
      {
        name: 'idx_resources_id_type_title',
        fields: ['id', 'type', 'title']
      }
    ]
  });

  return Resource;
};
