#!/usr/bin/env node

/**
 * Script to sync video durations from Gumlet API to local database
 * 
 * This script:
 * 1. Fetches all videos from the database that have external_video_id
 * 2. For each video, calls Gumlet API to get duration
 * 3. Converts duration from seconds to milliseconds
 * 4. Updates the video record with the duration
 * 
 * Usage:
 *   node scripts/sync-video-durations.js
 *   node scripts/sync-video-durations.js --dry-run  (preview changes without updating)
 *   node scripts/sync-video-durations.js --force     (update even if duration exists)
 */

require('dotenv').config();
const axios = require('axios');
const { Video } = require('../models');

// Configuration
const GUMLET_API_BASE = 'https://api.gumlet.com/v1/video/assets';
const API_KEY = process.env.GUMLET_API_KEY;

// Command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

/**
 * Fetch video duration from Gumlet API
 * @param {string} assetId - Gumlet asset ID
 * @returns {Promise<number|null>} Duration in milliseconds or null if error
 */
async function fetchGumletDuration(assetId) {
  try {
    console.log(`  📡 Fetching data for asset: ${assetId}`);
    
    const response = await axios.get(`${GUMLET_API_BASE}/${assetId}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'accept': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    const duration = response.data.input?.duration;
    if (duration && typeof duration === 'number') {
      // Convert from seconds to milliseconds
      const durationMs = Math.round(duration * 1000);
      console.log(`  ✅ Duration: ${duration}s (${durationMs}ms)`);
      return durationMs;
    } else {
      console.log(`  ⚠️  No valid duration found in response`);
      return null;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`  ❌ Asset not found: ${assetId}`);
    } else if (error.response?.status === 401) {
      console.log(`  ❌ Unauthorized - check API key`);
    } else {
      console.log(`  ❌ Error fetching asset ${assetId}: ${error.message}`);
    }
    return null;
  }
}

/**
 * Update video duration in database
 * @param {Object} video - Video model instance
 * @param {number} durationMs - Duration in milliseconds
 * @returns {Promise<boolean>} Success status
 */
async function updateVideoDuration(video, durationMs) {
  try {
    if (!isDryRun) {
      await video.update({ duration_ms: durationMs });
      console.log(`  💾 Updated video ${video.id} with duration: ${durationMs}ms`);
    } else {
      console.log(`  🔍 [DRY RUN] Would update video ${video.id} with duration: ${durationMs}ms`);
    }
    return true;
  } catch (error) {
    console.log(`  ❌ Error updating video ${video.id}: ${error.message}`);
    return false;
  }
}

/**
 * Main function to sync all video durations
 */
async function syncVideoDurations() {
  console.log('🎬 Starting video duration sync from Gumlet...\n');
  
  if (!API_KEY) {
    console.error('❌ GUMLET_API_KEY environment variable is not set');
    process.exit(1);
  }

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (isForce) {
    console.log('💪 FORCE MODE - Will update existing durations\n');
  }

  try {
    // Get all videos with external_video_id
    const whereClause = {
      external_video_id: { [require('sequelize').Op.ne]: null }
    };

    // If not force mode, only get videos without duration
    if (!isForce) {
      whereClause.duration_ms = null;
    }

    const videos = await Video.findAll({
      where: whereClause,
      attributes: ['id', 'title', 'external_video_id', 'duration_ms']
    });

    console.log(`📊 Found ${videos.length} videos to process\n`);

    if (videos.length === 0) {
      console.log('✨ All videos already have durations! Use --force to update existing durations.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Process each video
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      console.log(`\n🎥 [${i + 1}/${videos.length}] Processing: "${video.title}"`);
      console.log(`   ID: ${video.id} | Asset: ${video.external_video_id}`);
      
      if (video.duration_ms && !isForce) {
        console.log(`   ⏭️  Skipping - already has duration: ${video.duration_ms}ms`);
        skippedCount++;
        continue;
      }

      // Fetch duration from Gumlet
      const durationMs = await fetchGumletDuration(video.external_video_id);
      
      if (durationMs) {
        const success = await updateVideoDuration(video, durationMs);
        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
      } else {
        errorCount++;
      }

      // Add small delay to avoid rate limiting
      if (i < videos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SYNC SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Successful updates: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`📈 Total processed: ${videos.length}`);
    
    if (isDryRun) {
      console.log('\n🔍 This was a dry run - no actual changes were made');
      console.log('   Run without --dry-run to apply changes');
    }

    console.log('\n🎉 Video duration sync completed!');

  } catch (error) {
    console.error('\n❌ Fatal error during sync:', error.message);
    process.exit(1);
  }
}

// Show usage if help requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🎬 Video Duration Sync Script

This script fetches video durations from Gumlet API and updates the local database.

Usage:
  node scripts/sync-video-durations.js [options]

Options:
  --dry-run    Preview changes without updating database
  --force      Update existing durations (default: skip videos that already have duration)
  --help, -h   Show this help message

Examples:
  node scripts/sync-video-durations.js                    # Update videos missing duration
  node scripts/sync-video-durations.js --dry-run          # Preview changes
  node scripts/sync-video-durations.js --force            # Update all videos
  node scripts/sync-video-durations.js --force --dry-run  # Preview force update

Environment Variables:
  GUMLET_API_KEY    Required: Your Gumlet API key

`);
  process.exit(0);
}

// Run the sync
syncVideoDurations()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
