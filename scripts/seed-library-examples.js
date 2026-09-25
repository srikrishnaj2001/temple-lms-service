'use strict';
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { sequelize, Module, Content, Audio, Read, Resource } = require('../models');
const { seedVideoForId } = require('../src/utils/gumlet-seed-assets');

const examples = [
  { courseId: 1, slug: 'seva-reflection', durationMs: 51890, title: 'A moment before seva', readTitle: 'Welcoming guests with care',
    description: 'A short guided reflection on attention, kindness, and a thoughtful handover.',
    takeaways: ['Greet visitors warmly and listen before answering.', 'Ask a senior volunteer when you are unsure.', 'Keep shared spaces clear and hand over thoughtfully.'] },
  { courseId: 2, slug: 'prasadam-reflection', durationMs: 55420, title: 'Serving prasadam with gratitude', readTitle: 'Before the serving line opens',
    description: 'Prepare for service with clear communication, patience, and gratitude.',
    takeaways: ['Confirm your station with the service coordinator.', 'Follow local hygiene procedures and communicate about ingredients.', 'Serve patiently and leave your station ready for the next team.'] },
  { courseId: 3, slug: 'sacred-space-reflection', durationMs: 51030, title: 'Caring for a sacred space', readTitle: 'Attention in altar-support service',
    description: 'An unhurried reflection on preparation, permission, and careful handling.',
    takeaways: ['Confirm your tasks with the pujari or coordinator.', 'Ask before handling unfamiliar items.', 'Return materials carefully and communicate when finished.'] },
];

async function seedLibraryExamples() {
  const origin = process.env.LEARNER_ORIGIN || 'http://localhost:3006';
  const publicPath = path.resolve(__dirname, '../../lms-app/public');
  await sequelize.transaction(async transaction => {
    for (const example of examples) {
      const module = await Module.findOne({ where: { courseId: example.courseId }, order: [['sequenceNumber', 'ASC']], transaction });
      if (!module) continue;
      const transcript = fs.readFileSync(path.join(publicPath, 'audio', `${example.slug}.txt`), 'utf8').trim();
      const summary = `<p>${example.description}</p><ul>${example.takeaways.map(item => `<li>${item}</li>`).join('')}</ul>`;
      const externalResources = [
        { title: 'Explore the Bhagavad-gita', url: 'https://vedabase.io/en/library/bg/', description: 'Scripture and commentary for further study.' },
        { title: 'ISKCON Desire Tree', url: 'https://iskcondesiretree.com/', description: 'Devotional articles, talks, and community resources.' },
      ];
      const video = seedVideoForId(example.courseId * 100 + 11);
      const audioTitle = `${video.title} (Audio)`;
      const audioDefaults = {
        title: audioTitle, externalAudioId: video.externalVideoId, url: null, thumbnailUrl: null,
        description: 'Audio from an ISKCON Bangalore talk. Reused as sample learning content.',
        durationMs: video.durationMs, transcript: null, summary: null, externalResources: video.externalResources,
      };
      let audio = await Audio.findOne({ where: { title: example.title, url: `${origin}/audio/${example.slug}.mp3` }, transaction });
      if (audio) {
        const backupDir = path.resolve(__dirname, '../../.local-media');
        fs.mkdirSync(backupDir, { recursive: true });
        const backup = path.join(backupDir, `audio-before-gumlet-${audio.id}.json`);
        if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(audio.toJSON(), null, 2));
        await audio.update(audioDefaults, { transaction });
      } else {
        [audio] = await Audio.findOrCreate({ where: { title: audioTitle, externalAudioId: video.externalVideoId }, defaults: audioDefaults, transaction });
      }
      const body = `<h3>Begin with attention</h3>${transcript.split('\n').slice(1, -1).map(line => `<p>${line}</p>`).join('')}<h3>Carry this into your next service</h3><ul>${example.takeaways.map(item => `<li>${item}</li>`).join('')}</ul><p>These are sample orientation notes. Follow your temple coordinator's instructions for the specific service you have been assigned.</p>`;
      const [read] = await Read.findOrCreate({ where: { title: example.readTitle }, defaults: { description: example.description, body, summary, externalResources }, transaction });
      if (read.body === `<h2>${example.readTitle}</h2><p>${example.description}</p>${body}`) await read.update({ body }, { transaction });
      for (const [contentType, asset] of [['AUDIO', audio], ['READ', read]]) {
        const existing = await Content.findOne({ where: { moduleId: module.id, contentType, contentId: asset.id }, transaction });
        if (!existing) await Content.create({ moduleId: module.id, contentType, contentId: asset.id,
          sequenceNumber: (await Content.max('sequenceNumber', { where: { moduleId: module.id }, transaction }) || 0) + 1,
          startDate: new Date('2026-01-01'),
        }, { transaction });
      }
      const [resource] = await Resource.findOrCreate({ where: { title: `${example.readTitle} - checklist` }, defaults: {
        description: 'A quick reference to open alongside your service.', type: 'URL',
        url: `${origin}/resources/seva-checklist.html`, summary, externalResources,
      }, transaction });
      if (!(await Content.findOne({ where: { moduleId: module.id, contentType: 'RESOURCE', contentId: resource.id }, transaction }))) {
        await Content.create({ moduleId: module.id, contentType: 'RESOURCE', contentId: resource.id,
          sequenceNumber: (await Content.max('sequenceNumber', { where: { moduleId: module.id }, transaction }) || 0) + 1, startDate: new Date('2026-01-01'),
        }, { transaction });
      }
    }
  });
  console.log('Library examples ready: 3 audio lessons, 3 reads, and 3 owned resources (existing items preserved).');
}
module.exports = { seedLibraryExamples };
if (require.main === module) {
  sequelize.options.logging = false;
  seedLibraryExamples().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
}
