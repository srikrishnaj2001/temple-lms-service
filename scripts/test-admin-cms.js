'use strict';
// Creates only uniquely named QA records and removes those records in reverse order.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const base = process.env.CMS_TEST_URL || 'http://localhost:8006';
const prefix = `CMS-QA-${Date.now()}`;
const cleanup = [];
let token;
async function request(path, method = 'GET', body, authenticated = true) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body && { body: JSON.stringify(body) }) });
  return { status: response.status, ...await response.json() };
}
async function ok(path, method, body) {
  const result = await request(path, method, body);
  assert.equal(result.success, true, `${method || 'GET'} ${path}: ${result.error || result.message}`);
  return result.data;
}
async function create(path, data) {
  const row = await ok(path, 'POST', data);
  cleanup.unshift(() => ok(`${path}/${row.id}`, 'DELETE'));
  return row;
}
async function main() {
  assert.equal((await request('/courses', 'GET', undefined, false)).status, 401);
  const login = await ok('/auth/login', 'POST', { email: process.env.ADMIN_EMAIL || 'admin@example.com', password: process.env.ADMIN_PASSWORD || 'templeadmin' });
  token = login.token;
  assert.equal((await ok('/auth/session')).email, process.env.ADMIN_EMAIL || 'admin@example.com');
  const category = await create('/categories', { name: prefix, description: 'QA category', sequenceNumber: 100 });
  const role = await create('/roles', { name: `${prefix}-role` });
  await ok(`/categories/${category.id}`, 'PUT', { ...category, description: 'Updated category' });
  await ok(`/roles/${role.id}`, 'PUT', { name: `${prefix}-updated-role` });
  assert.equal((await request('/categories', 'POST', { name: prefix })).success, false);
  const tenants = await ok('/tenants');
  const tenant = (tenants.tenants || tenants)[0];
  const course = await create('/courses', { title: prefix, description: 'CMS QA course', tenantId: tenant.id, categoryIds: [category.id], roleIds: [role.id] });
  assert.equal(course.categories[0].id, category.id);
  assert.equal(course.roles[0].id, role.id);
  assert.equal((await request(`/categories/${category.id}`, 'DELETE')).success, false);
  const invalid = await request(`/courses/${course.id}`, 'PUT', { title: 'Must roll back', categoryIds: [2147483647] });
  assert.equal(invalid.success, false);
  assert.equal((await ok(`/courses/${course.id}`)).title, prefix);
  const module = await create('/modules', { title: `${prefix}-module`, description: 'QA module', courseId: course.id, sequenceNumber: 1 });
  const module2 = await create('/modules', { title: `${prefix}-module-2`, description: 'QA module', courseId: course.id, sequenceNumber: 2 });
  await ok(`/courses/${course.id}/reorder`, 'PATCH', { moduleIds: [module2.id, module.id] });
  assert.equal((await ok(`/courses/${course.id}`)).modules[0].id, module2.id);
  assert.equal((await request(`/courses/${course.id}/reorder`, 'PATCH', { moduleIds: [module.id] })).success, false);
  assert.equal((await request(`/courses/${course.id}/reorder`, 'PATCH', { moduleIds: [module.id, module.id, module2.id] })).success, false);
  assert.equal((await request(`/courses/${course.id}`, 'DELETE')).success, false);
  const links = [{ title: 'External reference', url: 'https://www.iskconbangalore.org/' }];
  const placements = [];
  for (const [type, path, extra] of [
    ['VIDEO', '/videos', { externalVideoId: '6aa7c47e07a6f8ff2989d412', transcript: 'QA transcript' }],
    ['AUDIO', '/audios', { externalAudioId: '6aa7c47e07a6f8ff2989d412', transcript: 'QA audio transcript' }],
    ['RESOURCE', '/resources', { url: 'https://www.iskconbangalore.org/', type: 'URL' }],
    ['READ', '/reads', { body: '<h2>Seva</h2><p>Serve with care.</p>' }],
  ]) {
    const asset = await create(path, { title: `${prefix}-${type}`, description: 'QA lesson', summary: 'QA summary', externalResources: links, ...extra });
    const placement = await create('/contents', { contentType: type, contentId: asset.id, moduleId: module.id, sequenceNumber: placements.length + 1 });
    placements.push(placement.id);
    assert.equal((await request(`${path}/${asset.id}`, 'DELETE')).success, false);
    const updated = await ok(`${path}/${asset.id}`, 'PUT', { title: `${prefix}-${type}-updated`, summary: 'Updated summary', externalResources: [] });
    assert.equal(updated.summary, 'Updated summary');
    assert.equal(updated.externalResources.length, 0);
  }
  await ok(`/modules/${module.id}/reorder`, 'PATCH', { contentIds: [...placements].reverse() });
  const tree = await ok(`/modules/${module.id}/contents`);
  assert.equal(tree.contents.length, 4);
  assert.equal(tree.contents[0].id, placements.at(-1));
  assert.ok(tree.contents.every(row => row.actualContent.title.endsWith('-updated')));
  const db = require('../models');
  const email = `${prefix.toLowerCase()}@example.test`;
  const user = await ok('/cms/users', 'POST', { name: prefix, email, roleIds: [role.id] });
  cleanup.unshift(async () => {
    // Only this run's isolated QA user and enrollment history are disposable.
    const found = await db.User.findOne({ where: { id: user.id, email } });
    if (found) {
      await db.Enrollment.destroy({ where: { userId: found.id }, force: true });
      await db.UserRole.destroy({ where: { userId: found.id } });
      await ok(`/users/${found.id}`, 'DELETE');
    }
  });
  assert.equal(await db.Enrollment.count({ where: { userId: user.id, courseId: course.id } }), 1);
  await ok(`/cms/users/${user.id}`, 'PUT', { name: `${prefix} updated`, email, roleIds: [role.id], phone: '1234567890' });
  assert.equal(await db.Enrollment.count({ where: { userId: user.id, courseId: course.id } }), 1);
  const learnerResponse = await fetch(`${base}/v1/courses/${course.id}/library`, { headers: { 'user-email': email } });
  assert.equal(learnerResponse.status, 200);
  const learner = (await learnerResponse.json()).data;
  const lessons = learner.modules.flatMap(row => row.contents);
  assert.equal(lessons.length, 4);
  assert.ok(lessons.every(row => row.summary === 'Updated summary'));
  assert.ok(lessons.find(row => row.contentType === 'READ').body.includes('Serve with care'));
  assert.equal(lessons.find(row => row.contentType === 'AUDIO').transcript, 'QA audio transcript');
  assert.equal((await request(`/users/${user.id}`, 'DELETE')).success, false);
  const gumlet = await ok('/gumlet/assets');
  assert.ok(Array.isArray(gumlet.assets));
  console.log(`PASS: authentication, category/role CRUD, course tags, rollback, module/lesson ordering, 4 content types, summaries, links, user roles, auto-enrollment, learner library propagation, in-use deletion guards. Gumlet assets: ${gumlet.assets.length}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  for (const remove of cleanup) { try { await remove(); } catch (error) { console.error(`QA cleanup: ${error.message}`); process.exitCode = 1; } }
  if (token) { await request('/auth/logout', 'POST'); assert.equal((await request('/auth/session')).status, 401); }
  await require('../models').sequelize.close();
});
