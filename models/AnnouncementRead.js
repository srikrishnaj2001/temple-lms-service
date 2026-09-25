'use strict';

/**
 * AnnouncementRead — per-board, per-student read marker.
 *
 * Presence of a row = "this student has read this announcement on this board".
 * Absence of a row = unread. We never UPDATE read_at on subsequent calls
 * (preserves "first read" semantics for future analytics).
 *
 * Key on (announcementCourseId, userId), not on announcementId,
 * because the v1 spec is explicit that cross-posted announcements have
 * independent read state per board.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AnnouncementRead extends Model {}

  AnnouncementRead.init({
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    announcementCourseId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    readAt: {
      type: 'TIMESTAMPTZ',
      allowNull: false,
      defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
    }
  }, {
    sequelize,
    modelName: 'AnnouncementRead',
    tableName: 'announcementReads',
    indexes: [
      { name: 'idx_announcement_reads_unique', fields: ['announcementCourseId', 'userId'], unique: true },
      { name: 'idx_announcement_reads_user', fields: ['userId'] }
    ]
  });

  return AnnouncementRead;
};
