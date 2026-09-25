'use strict';

/**
 * AnnouncementCourse is the per-course announcement relationship.
 *
 * One row per announcement/course pair owns the per-course state:
 * isPinned, pinnedAt, isHome, and attachedAt.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AnnouncementCourse extends Model {}

  AnnouncementCourse.init({
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    announcementId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    courseId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    isPinned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    pinnedAt: {
      type: 'TIMESTAMPTZ',
      allowNull: true
    },
    isHome: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    attachedAt: {
      type: 'TIMESTAMPTZ',
      allowNull: false,
      defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
    }
  }, {
    sequelize,
    modelName: 'AnnouncementCourse',
    tableName: 'announcementCourses',
    paranoid: true
  });

  return AnnouncementCourse;
};
