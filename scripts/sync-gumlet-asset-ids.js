const axios = require('axios');
const { Video, sequelize } = require('../models');

async function syncGumletAssetIds() {
  console.log('🚀 Starting Gumlet Asset ID sync...\n');
  
  try {
    // Fetch all assets from Gumlet API
    console.log('📡 Fetching assets from Gumlet API...');
    const response = await axios.get(`https://api.gumlet.com/v1/video/assets/list/${process.env.GUMLET_COLLECTION_ID}?sortBy=createdAt&orderBy=desc`, {
      headers: {
        'Authorization': `Bearer ${process.env.GUMLET_API_KEY}`,
        'accept': 'application/json'
      }
    });

    const gumletAssets = response.data.all_assets;
    console.log(`✅ Found ${gumletAssets.length} assets from Gumlet\n`);

    // Get all videos from database
    const dbVideos = await Video.findAll({
      attributes: ['id', 'title', 'external_video_id'],
      order: [['id', 'ASC']]
    });
    
    console.log(`📊 Found ${dbVideos.length} videos in database\n`);

    // Create mapping strategy
    console.log('🔄 Mapping strategy: Sequential assignment by creation order');
    console.log('   - Database videos ordered by ID (oldest first)');
    console.log('   - Gumlet assets ordered by creation date (newest first)');
    console.log('   - Will reverse Gumlet order to match oldest-first pattern\n');

    // Reverse Gumlet assets to match oldest-first order (like database)
    const sortedGumletAssets = [...gumletAssets].reverse();

    let updateCount = 0;
    const maxUpdates = Math.min(dbVideos.length, sortedGumletAssets.length);

    console.log('📝 Starting updates...\n');

    for (let i = 0; i < maxUpdates; i++) {
      const video = dbVideos[i];
      const gumletAsset = sortedGumletAssets[i];
      
      // Update the video with the Gumlet asset_id
      await video.update({
        external_video_id: gumletAsset.asset_id
      });

      updateCount++;
      
      console.log(`✅ Updated Video ${video.id}: "${video.title}"`);
      console.log(`   🎬 Asset ID: ${gumletAsset.asset_id}`);
      console.log(`   📽️  Gumlet Title: "${gumletAsset.input.title}"`);
      console.log(`   ⏱️  Duration: ${Math.round(gumletAsset.input.duration)} seconds\n`);
    }

    console.log('🎉 ✅ SYNC COMPLETED SUCCESSFULLY! ✅ 🎉\n');
    console.log('📊 SUMMARY:');
    console.log('═══════════════════════════════════════════');
    console.log(`🎬 Videos updated: ${updateCount}`);
    console.log(`📡 Gumlet assets available: ${gumletAssets.length}`);
    console.log(`📊 Database videos: ${dbVideos.length}`);
    console.log('═══════════════════════════════════════════\n');

    if (dbVideos.length > gumletAssets.length) {
      console.log(`⚠️  Warning: ${dbVideos.length - gumletAssets.length} database videos have no matching Gumlet assets`);
    } else if (gumletAssets.length > dbVideos.length) {
      console.log(`ℹ️  Info: ${gumletAssets.length - dbVideos.length} Gumlet assets are not mapped to database videos`);
    }

    console.log('\n🚀 All video external_video_ids have been updated with Gumlet asset_ids!');
    
  } catch (error) {
    console.error('❌ Error syncing Gumlet asset IDs:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    throw error;
  }
}

// Run the sync
syncGumletAssetIds()
  .then(() => {
    console.log('\n✨ Sync completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Sync failed:', error);
    process.exit(1);
  });
