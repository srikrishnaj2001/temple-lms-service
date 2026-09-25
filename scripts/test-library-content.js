'use strict';
// Local integration check. Creates isolated fixtures and removes them in finally.
require('dotenv').config();
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const db = require('../models');
const assets = require('../src/services/libraryAssets');
const admin = require('../src/services/admin');
const courses = require('../src/services/courses');
const { assetPayload, supplementaryPayload } = require('../src/utils/lessonContent');
db.sequelize.options.logging = false;

async function main() {
  const ids = {};
  try {
    assert.throws(() => assetPayload({ url: 'javascript:alert(1)' }, 'AUDIO'));
    assert.throws(() => supplementaryPayload({ externalResources: [{ title: 'Bad', url: 'data:text/html,hello' }] }));
    assert.throws(() => assetPayload({ durationMs: -1 }, 'AUDIO'));
    assert.throws(() => assetPayload({ body: '<p></p>' }, 'READ'));
    const clean = assetPayload({ body: '<p>Hello</p><script>alert(1)</script><img src=x onerror=alert(1)>' }, 'READ');
    assert(!clean.body.includes('script') && !clean.body.includes('onerror'));
    const tenant = await db.Tenant.findOne();
    assert(tenant, 'Seed a tenant before running this check');
    const course = await db.Course.create({ title: 'Library QA fixture', tenantId: tenant.id }); ids.course = course.id;
    const module = await db.Module.create({ courseId: course.id, title: 'QA module', startDate: new Date(0), sequenceNumber: 1 }); ids.module = module.id;
    const user = await db.User.create({ name: 'Library QA', email: `library-qa-${randomUUID()}@example.test` }); ids.user = user.id;
    const enrollment = await db.Enrollment.create({ userId: user.id, courseId: course.id }); ids.enrollment = enrollment.id;
    const newCourse = await db.Course.create({ title: 'New course access QA', tenantId: tenant.id }); ids.newCourse = newCourse.id;
    await assert.rejects(courses.getCourseLibrary(newCourse.id, user.email), /not enrolled/);
    await user.update({ onboardingSkipped: true });
    await Promise.all([courses.getCourseLibrary(newCourse.id, user.email), courses.getCourseLibrary(newCourse.id, user.email)]);
    assert.equal(await db.Enrollment.count({ where: { userId: user.id, courseId: newCourse.id } }), 1);
    await db.Enrollment.destroy({ where: { userId: user.id, courseId: newCourse.id } });
    await assert.rejects(courses.getCourseLibrary(newCourse.id, user.email), /not enrolled/);
    const otherTenant = await db.Tenant.create({ name: 'QA access boundary', domain: `${randomUUID()}.example.test` }); ids.tenant = otherTenant.id;
    const otherCourse = await db.Course.create({ title: 'Other tenant QA', tenantId: otherTenant.id }); ids.otherCourse = otherCourse.id;
    await assert.rejects(courses.getCourseLibrary(otherCourse.id, user.email), /not enrolled/);
    await assert.rejects(courses.getCourseLibrary(course.id, user.email, otherTenant.id), /Course not found/);
    const links = [{ title: 'Reference', url: 'https://example.com/article', description: 'Related reading' }];
    const audio = (await assets.save('audios', null, { title: 'QA audio', url: 'http://localhost:3006/audio/seva-reflection.mp3', transcript: 'An exact sample transcript.', summary: '<p>Sample summary</p>', externalResources: links })).data; ids.audio = audio.id;
    const read = (await assets.save('reads', null, { title: 'QA read', body: '<h2>Read</h2><p>Owned text</p>', summary: '<p>Read summary</p>', externalResources: links })).data; ids.read = read.id;
    const placedAudio = await admin.createContent({ moduleId: module.id, contentType: 'AUDIO', contentId: audio.id, sequenceNumber: 1, startDate: new Date(0) });
    assert(placedAudio.success, JSON.stringify(placedAudio));
    const placedRead = await admin.createContent({ moduleId: module.id, contentType: 'READ', contentId: read.id, sequenceNumber: 2, startDate: new Date(0) });
    assert(placedRead.success, JSON.stringify(placedRead));
    assert.equal((await admin.updateModule(module.id, { startDate: null, endDate: null })).success, true);
    await module.reload(); assert.ok(module.startDate <= new Date()); assert.equal(module.endDate, null);
    assert.equal((await admin.updateContent(placedRead.data.id, { startDate: null })).success, true);
    assert.ok((await db.Content.findByPk(placedRead.data.id)).startDate <= new Date());
    const library = await courses.getCourseLibrary(course.id, user.email);
    const lessons = library.modules.flatMap(m => m.contents);
    assert.equal(lessons.length, 2);
    assert.equal(lessons[0].transcript, audio.transcript);
    assert.deepEqual(lessons[0].externalResources, links);
    assert.equal(lessons[1].body, read.body);
    const cloneTransaction = await db.sequelize.transaction();
    try {
      for (const lesson of lessons) {
        const cloned = await admin.cloneActualContent({ contentType: lesson.contentType, contentId: lesson.contentId }, cloneTransaction);
        assert.deepEqual(cloned.externalResources, links);
        if (lesson.contentType === 'AUDIO') assert.equal(cloned.transcript, audio.transcript);
        else assert.equal(cloned.body, read.body);
      }
    } finally { await cloneTransaction.rollback(); }
    assert.deepEqual(admin.mapVideoPayload({ transcript: 'Video words', summary: '<p>Video summary</p>', externalResources: links }).externalResources, links);
    assert.deepEqual(admin.mapResourcePayload({ summary: '<p>Resource summary</p>', externalResources: links }).externalResources, links);
    await assert.rejects(assets.remove('audios', audio.id), /used in/);
    await assert.rejects(courses.getCourseLibrary(course.id, 'missing@example.test'));
    await Promise.all([
      courses.updateContentProgress(user.email, lessons[0].id, { status: 'COMPLETED', watchedDuration: 50 }),
      courses.updateContentProgress(user.email, lessons[0].id, { status: 'IN_PROGRESS', watchedDuration: 12 })
    ]);
    const progress = await db.EnrollmentContentProgress.findOne({ where: { enrollmentId: enrollment.id, contentId: lessons[0].id } });
    assert.equal(progress.status, 'COMPLETED'); assert.equal(progress.watchedDuration, 50);
    await assets.save('audios', audio.id, { summary: '', transcript: '', externalResources: [] });
    await audio.reload(); assert.equal(audio.transcript, ''); assert.deepEqual(audio.externalResources, []);
    await assets.save('reads', read.id, { body: '<p>Updated read</p>' });
    await read.reload(); assert.equal(read.body, '<p>Updated read</p>');
    console.log('PASS: validation, sanitization, audio/read CRUD, placements, date clearing, learner metadata, new-course access, tenant/revocation boundaries, and concurrent progress.');
  } finally {
    if (ids.enrollment) await db.EnrollmentContentProgress.destroy({ where: { enrollmentId: ids.enrollment }, force: true });
    if (ids.module) await db.Content.destroy({ where: { moduleId: ids.module }, force: true });
    if (ids.audio) await assets.remove('audios', ids.audio);
    if (ids.read) await assets.remove('reads', ids.read);
    if (ids.user) await db.Enrollment.destroy({ where: { userId: ids.user }, force: true });
    if (ids.module) await db.Module.destroy({ where: { id: ids.module }, force: true });
    if (ids.course) await db.Course.destroy({ where: { id: ids.course }, force: true });
    if (ids.newCourse) await db.Course.destroy({ where: { id: ids.newCourse }, force: true });
    if (ids.otherCourse) await db.Course.destroy({ where: { id: ids.otherCourse }, force: true });
    if (ids.tenant) await db.Tenant.destroy({ where: { id: ids.tenant }, force: true });
    if (ids.user) await db.User.destroy({ where: { id: ids.user }, force: true });
    await db.sequelize.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
