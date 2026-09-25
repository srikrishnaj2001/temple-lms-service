'use strict';

/**
 * Announcement — the global content row.
 *
 * One row holds the title / body / expiry shared across all boards the
 * announcement appears on. The per-board relationship lives in
 * AnnouncementCourse; reads live in AnnouncementRead.
 *
 * Soft delete (paranoid) keeps the row around for future comment/like
 * features that reference it.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Announcement extends Model {}

  Announcement.init({
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    title: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    bodyHtml: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    bodyPreview: {
      type: DataTypes.STRING(280),
      allowNull: false
    },
    imageUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true
    },
    authorUserId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    expiryAt: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    tenantId: {
      type: DataTypes.UUID,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Announcement',
    tableName: 'announcements',
    paranoid: true,
    indexes: [
      { name: 'idx_announcements_active_set', fields: ['deletedAt', 'expiryAt'] },
      { name: 'idx_announcements_created_at', fields: ['createdAt'] }
    ]
  });

  return Announcement;
};
