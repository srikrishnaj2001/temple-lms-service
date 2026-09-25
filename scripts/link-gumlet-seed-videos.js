'use strict';

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize, Video } = require('../models');
const { QueryTypes } = require('sequelize');
const { courses, contentId, TENANT_ID } = require('./seed-local-temple-data');
const { seedVideoForId } = require('../src/utils/gumlet-seed-assets');

async function main() {
  const apply = process.argv.includes('--apply');
  try {
    await sequelize.transaction(async (transaction) => {
      const changes = [];
      for (const course of courses) {
        for (const [moduleIndex, module] of course.modules.entries()) {
          for (const [index, content] of module.contents.entries()) {
            if (content[0] !== 'VIDEO') continue;
            const id = contentId(course.id, moduleIndex + 1, index + 1);
            const video = await Video.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!video) continue;
            const [owner] = await sequelize.query(`
              SELECT c.id FROM contents ct JOIN modules m ON m.id = ct."moduleId"
              JOIN courses c ON c.id = m."courseId"
              WHERE ct."contentId" = :id AND ct."contentType" = 'VIDEO'
                AND c.id = :courseId AND c."tenantId" = :tenantId
                AND ct."deletedAt" IS NULL AND m."deletedAt" IS NULL
            `, { replacements: { id, courseId: course.id, tenantId: TENANT_ID }, type: QueryTypes.SELECT, transaction });
            if (!owner) continue;
            const target = seedVideoForId(id);
            if (video.externalVideoId === target.externalVideoId) continue;
            // Do not overwrite lessons edited in the CMS or unrelated video rows.
            if (video.title !== content[1] || video.externalVideoId !== content[4]) continue;
            changes.push({ before: video.toJSON(), after: { id, ...target } });
          }
        }
      }
      console.log(`${apply ? 'Applying' : 'Planned'} ${changes.length} seed-only video replacements across ${courses.length} demo courses.`);
      if (!apply || !changes.length) return;
      const directory = path.join(__dirname, '../../.local-media/iskcon-bangalore');
      fs.mkdirSync(directory, { recursive: true });
      const backup = path.join(directory, `video-link-backup-${Date.now()}.json`);
      fs.writeFileSync(backup, JSON.stringify(changes, null, 2), { mode: 0o600, flag: 'wx' });
      for (const change of changes) {
        const { id, ...values } = change.after;
        await Video.update(values, { where: { id }, transaction });
      }
      console.log(`Backup: ${backup}`);
    });
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
