'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContentAttachment extends Model {}

  ContentAttachment.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    contentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'contents',
        key: 'id'
      }
    },
    resourceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'resources',
        key: 'id'
      }
    },
    sequenceNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    }
  }, {
    sequelize,
    modelName: 'ContentAttachment',
    tableName: 'contentAttachments',
    indexes: [
      { name: 'idx_content_attachments_unique', unique: true, fields: ['contentId', 'resourceId'] }
    ]
  });

  return ContentAttachment;
};
