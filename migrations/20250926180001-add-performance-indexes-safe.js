'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    // Helper function to check if index exists
    const indexExists = async (tableName, indexName) => {
      const [results] = await queryInterface.sequelize.query(`
        SELECT 1 FROM pg_indexes 
        WHERE tablename = '${tableName}' 
        AND indexname = '${indexName}';
      `, { transaction });
      return results.length > 0;
    };

    // Helper function to safely add indexes
    const safeAddIndex = async (tableName, indexOptions) => {
      const exists = await indexExists(tableName, indexOptions.name);
      
      if (exists) {
        return;
      }
      
      try {
        await queryInterface.addIndex(tableName, {
          ...indexOptions,
          transaction
        });
      } catch (error) {
        throw error;
      }
    };
    
    try {
      // ===== MODULES TABLE INDEXES =====
      await safeAddIndex('modules', {
        fields: ['course_id', 'sequence_number'],
        name: 'idx_modules_course_sequence'
      });
      await safeAddIndex('modules', {
        fields: ['start_date'],
        name: 'idx_modules_start_date'
      });
      await safeAddIndex('modules', {
        fields: ['course_id'],
        name: 'idx_modules_course_id'
      });

      // ===== CONTENTS TABLE INDEXES =====
      await safeAddIndex('contents', {
        fields: ['module_id', 'sequence_number'],
        name: 'idx_contents_module_sequence'
      });
      await safeAddIndex('contents', {
        fields: ['content_type', 'content_id'],
        name: 'idx_contents_polymorphic'
      });
      await safeAddIndex('contents', {
        fields: ['start_date'],
        name: 'idx_contents_start_date'
      });
      await safeAddIndex('contents', {
        fields: ['module_id'],
        name: 'idx_contents_module_id'
      });
      await safeAddIndex('contents', {
        fields: ['content_type'],
        name: 'idx_contents_type'
      });

      // ===== VIDEOS TABLE INDEXES =====
      await safeAddIndex('videos', {
        fields: ['external_video_id'],
        name: 'idx_videos_external_id',
        unique: true
      });

      // ===== ASSIGNMENTS TABLE INDEXES =====
      await safeAddIndex('assignments', {
        fields: ['id', 'title'],
        name: 'idx_assignments_id_title'
      });

      // ===== RESOURCES TABLE INDEXES =====
      await safeAddIndex('resources', {
        fields: ['type'],
        name: 'idx_resources_type'
      });
      await safeAddIndex('resources', {
        fields: ['id', 'type', 'title'],
        name: 'idx_resources_id_type_title'
      });

      // ===== EVENTS TABLE INDEXES =====
      await safeAddIndex('events', {
        fields: ['start_time', 'end_time'],
        name: 'idx_events_time_range'
      });
      await safeAddIndex('events', {
        fields: ['start_time'],
        name: 'idx_events_start_time'
      });

      // ===== COURSE_TOOLS TABLE INDEXES =====
      await safeAddIndex('course_tools', {
        fields: ['course_id'],
        name: 'idx_course_tools_course'
      });
      await safeAddIndex('course_tools', {
        fields: ['tool_id'],
        name: 'idx_course_tools_tool'
      });

      // ===== ENROLLMENTS TABLE INDEXES =====
      await safeAddIndex('enrollments', {
        fields: ['user_id'],
        name: 'idx_enrollments_user'
      });
      await safeAddIndex('enrollments', {
        fields: ['course_id'],
        name: 'idx_enrollments_cohort'
      });
      await safeAddIndex('enrollments', {
        fields: ['user_id', 'course_id'],
        name: 'idx_enrollments_user_cohort'
      });

      // ===== USERS TABLE INDEXES =====
      await safeAddIndex('users', {
        fields: ['email'],
        name: 'idx_users_email',
        unique: true
      });

      // ===== USER_METADATA TABLE INDEXES =====
      await safeAddIndex('user_metadata', {
        fields: ['user_id'],
        name: 'idx_user_metadata_user',
        unique: true
      });

      // ===== COMMUNITY_LINKS TABLE INDEXES =====
      await safeAddIndex('community_links', {
        fields: ['course_id'],
        name: 'idx_community_links_course'
      });
      await safeAddIndex('community_links', {
        fields: ['title'],
        name: 'idx_community_links_title'
      });

      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    // Helper function to check if index exists (for removal)
    const indexExists = async (tableName, indexName) => {
      const [results] = await queryInterface.sequelize.query(`
        SELECT 1 FROM pg_indexes 
        WHERE tablename = '${tableName}' 
        AND indexname = '${indexName}';
      `, { transaction });
      return results.length > 0;
    };

    const safeRemoveIndex = async (tableName, indexName) => {
      const exists = await indexExists(tableName, indexName);
      
      if (!exists) {
        return;
      }
      
      try {
        await queryInterface.removeIndex(tableName, indexName, { transaction });
      } catch (error) {
        throw error;
      }
    };
    
    try {
    
      // Remove indexes in reverse order
      await safeRemoveIndex('community_links', 'idx_community_links_title');
      await safeRemoveIndex('community_links', 'idx_community_links_course');
      await safeRemoveIndex('user_metadata', 'idx_user_metadata_user');
      await safeRemoveIndex('users', 'idx_users_email');
      await safeRemoveIndex('enrollments', 'idx_enrollments_user_cohort');
      await safeRemoveIndex('enrollments', 'idx_enrollments_cohort');
      await safeRemoveIndex('enrollments', 'idx_enrollments_user');
      await safeRemoveIndex('course_tools', 'idx_course_tools_tool');
      await safeRemoveIndex('course_tools', 'idx_course_tools_course');
      await safeRemoveIndex('events', 'idx_events_start_time');
      await safeRemoveIndex('events', 'idx_events_time_range');
      await safeRemoveIndex('resources', 'idx_resources_id_type_title');
      await safeRemoveIndex('resources', 'idx_resources_type');
      await safeRemoveIndex('assignments', 'idx_assignments_id_title');
      await safeRemoveIndex('videos', 'idx_videos_external_id');
      await safeRemoveIndex('contents', 'idx_contents_type');
      await safeRemoveIndex('contents', 'idx_contents_module_id');
      await safeRemoveIndex('contents', 'idx_contents_start_date');
      await safeRemoveIndex('contents', 'idx_contents_polymorphic');
      await safeRemoveIndex('contents', 'idx_contents_module_sequence');
      await safeRemoveIndex('modules', 'idx_modules_course_id');
      await safeRemoveIndex('modules', 'idx_modules_start_date');
      await safeRemoveIndex('modules', 'idx_modules_course_sequence');
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
