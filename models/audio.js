'use strict';
module.exports = (sequelize, DataTypes) => sequelize.define('Audio', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.TEXT,
  url: { type: DataTypes.STRING(2048), allowNull: true },
  externalAudioId: { type: DataTypes.STRING(255), field: 'external_audio_id' },
  thumbnailUrl: { type: DataTypes.STRING(2048), field: 'thumbnail_url' },
  durationMs: { type: DataTypes.INTEGER, field: 'duration_ms' },
  summary: DataTypes.TEXT,
  transcript: DataTypes.TEXT,
  externalResources: { type: DataTypes.JSONB, field: 'external_resources', allowNull: false, defaultValue: [] },
}, { tableName: 'audios', underscored: true, validate: {
  hasSource() { if (!this.externalAudioId && !this.url) throw new Error('A Gumlet asset ID or audio URL is required'); },
} });
