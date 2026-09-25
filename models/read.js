'use strict';
module.exports = (sequelize, DataTypes) => sequelize.define('Read', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.TEXT,
  body: { type: DataTypes.TEXT, allowNull: false },
  summary: DataTypes.TEXT,
  externalResources: { type: DataTypes.JSONB, field: 'external_resources', allowNull: false, defaultValue: [] },
}, { tableName: 'reads', underscored: true });
