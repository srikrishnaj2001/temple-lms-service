'use strict';
const router = require('express').Router();
const { Category, Role, CourseCategory, CourseRole, UserRole, User, Course, Module, Content, Enrollment, sequelize } = require('../../models');
const run = handler => async (req, res) => {
  try { res.json({ success: true, data: await handler(req) }); }
  catch (error) { res.status(error.status || 400).json({ success: false, error: error.name === 'SequelizeUniqueConstraintError' ? 'This name or slug already exists.' : error.message }); }
};
const idList = value => {
  if (!Array.isArray(value) || value.some(id => !Number.isInteger(Number(id)) || Number(id) < 1)) throw new Error('Select valid IDs.');
  const ids = value.map(Number);
  if (new Set(ids).size !== ids.length) throw new Error('Each ID must appear exactly once.');
  return ids;
};
for (const [path, Model] of [['categories', Category], ['roles', Role]]) {
  const payload = body => {
    const name = String(body.name || '').trim();
    if (!name || name.length > 100) throw new Error('Name must contain 1 to 100 characters.');
    if (path === 'roles') return { name };
    const slug = String(body.slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug || slug.length > 140) throw new Error('Enter a valid category slug.');
    const sequenceNumber = Number(body.sequenceNumber || 0);
    if (!Number.isInteger(sequenceNumber) || sequenceNumber < 0) throw new Error('Order must be a positive whole number or zero.');
    return { name, slug, description: String(body.description || '').trim(), sequenceNumber };
  };
  router.get(`/${path}`, run(() => Model.findAll({ order: path === 'categories' ? [['sequenceNumber', 'ASC'], ['name', 'ASC']] : [['name', 'ASC']] })));
  router.post(`/${path}`, run(req => Model.create(payload(req.body))));
  router.put(`/${path}/:id`, run(async req => {
    const row = await Model.findByPk(req.params.id);
    if (!row) throw new Error('Item not found.');
    return row.update(payload(req.body));
  }));
  router.delete(`/${path}/:id`, run(async req => {
    const where = path === 'roles' ? { roleId: req.params.id } : { categoryId: req.params.id };
    const count = await (path === 'roles' ? CourseRole : CourseCategory).count({ where });
    if (count || (path === 'roles' && await UserRole.count({ where }))) throw new Error('This item is in use. Remove its assignments before deleting.');
    if (!await Model.destroy({ where: { id: req.params.id } })) throw new Error('Item not found.');
    return { deleted: true };
  }));
}

router.get('/cms/users', run(() => User.findAll({ include: [{ model: Role, as: 'roles', through: { attributes: [] } }], order: [['createdAt', 'DESC']] })));
for (const method of ['post', 'put']) router[method](method === 'post' ? '/cms/users' : '/cms/users/:id', run(req => sequelize.transaction(async transaction => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A name and valid email are required.');
  const payload = { name, email, phone: String(req.body.phone || '').trim() || null };
  let user;
  if (method === 'post') user = await User.create(payload, { transaction });
  else {
    user = await User.findByPk(req.params.id, { transaction });
    if (!user) throw new Error('User not found.');
    await user.update(payload, { transaction });
  }
  const ids = idList(req.body.roleIds || []);
  if (await Role.count({ where: { id: ids }, transaction }) !== ids.length) throw new Error('Role not found.');
  await user.setRoles(ids, { transaction });
  const tagged = await CourseRole.findAll({ where: { roleId: ids }, transaction });
  for (const courseId of new Set(tagged.map(row => row.courseId))) {
    const [enrollment] = await Enrollment.findOrCreate({ where: { userId: user.id, courseId }, defaults: { userId: user.id, courseId }, paranoid: false, transaction });
    if (enrollment.deletedAt) await enrollment.restore({ transaction });
  }
  return user;
})));
router.put('/cms/users/:id/roles', run(req => sequelize.transaction(async transaction => {
  const user = await User.findByPk(req.params.id, { transaction });
  if (!user) throw new Error('User not found.');
  const ids = idList(req.body.roleIds);
  if (await Role.count({ where: { id: ids }, transaction }) !== ids.length) throw new Error('Role not found.');
  await user.setRoles(ids, { transaction });
  const rows = await CourseRole.findAll({ where: { roleId: ids }, transaction });
  await Enrollment.bulkCreate([...new Set(rows.map(row => row.courseId))].map(courseId => ({ courseId, userId: user.id })), { ignoreDuplicates: true, transaction });
  return { roleIds: ids };
})));

for (const [path, Parent, Model, foreignKey, key] of [
  ['courses', Course, Module, 'courseId', 'moduleIds'],
  ['modules', Module, Content, 'moduleId', 'contentIds'],
]) {
  router.patch(`/${path}/:id/reorder`, run(req => sequelize.transaction(async transaction => {
    const parent = await Parent.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!parent) throw new Error('Parent not found.');
    const ids = idList(req.body[key]);
    const rows = await Model.findAll({ where: { [foreignKey]: parent.id }, transaction });
    if (ids.length !== rows.length || rows.some(row => !ids.includes(row.id))) throw new Error('Reorder must contain every item exactly once.');
    const max = Number(await Model.max('sequenceNumber', { where: { [foreignKey]: parent.id }, paranoid: false, transaction })) || 0;
    for (const [index, id] of ids.entries()) await Model.update({ sequenceNumber: max + index + 1 }, { where: { id }, transaction });
    for (const [index, id] of ids.entries()) await Model.update({ sequenceNumber: index + 1 }, { where: { id }, transaction });
    return { reordered: true };
  })));
}
router.use('/gumlet', require('./gumletAdmin'));
module.exports = router;
