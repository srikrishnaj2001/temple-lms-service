'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Content extends Model {
    // Get the actual content based on polymorphic relationship
    async getContentData() {
      const models = sequelize.models;
      let contentModel;
      
      switch (this.contentType) {
        case 'VIDEO':
          contentModel = models.Video;
          break;
        case 'RESOURCE':
          contentModel = models.Resource;
          break;
        case 'AUDIO':
          contentModel = models.Audio;
          break;
        case 'READ':
          contentModel = models.Read;
          break;
        default:
          return null;
      }
      
      return await contentModel.findByPk(this.contentId);
    }
  }

  Content.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    contentId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    contentType: {
      type: DataTypes.ENUM('VIDEO', 'RESOURCE', 'AUDIO', 'READ'),
      allowNull: false
    },
    sequenceNumber: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    startDate: {
      type: 'TIMESTAMPTZ',
      allowNull: false,
    },
    moduleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'modules',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'Content',
    tableName: 'contents',
    paranoid: true, // Enables soft deletes
    indexes: [
      {
        name: 'idx_contents_module_sequence',
        fields: ['moduleId', 'sequenceNumber']
      },
      {
        name: 'idx_contents_polymorphic',
        fields: ['contentType', 'contentId']
      },
      {
        name: 'idx_contents_start_date',
        fields: ['startDate']
      },
      {
        name: 'idx_contents_module_id',
        fields: ['moduleId']
      },
      {
        name: 'idx_contents_type',
        fields: ['contentType']
      }
    ]
  });

  return Content;
};
