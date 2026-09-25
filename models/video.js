'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Video extends Model {
  }

  Video.init({
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
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'AI-generated HTML-formatted summary with key takeaways'
    },
    transcript: { type: DataTypes.TEXT, allowNull: true },
    externalResources: { type: DataTypes.JSONB, field: 'external_resources', allowNull: false, defaultValue: [] },
    externalVideoId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Video duration in milliseconds'
    }
  }, {
    sequelize,
    modelName: 'Video',
    tableName: 'videos',
    indexes: [
      {
        name: 'idx_videos_external_id',
        fields: ['externalVideoId']
      }
    ]
  });

  return Video;
};
