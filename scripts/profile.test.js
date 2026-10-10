'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('profile updates validate names and normalize the learner email', async () => {
  let saves = 0;
  const user = { id: 1, name: 'Learner', email: 'learner@example.test', save: async () => { saves++; } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/routers/me.js'), 'utf8'), {
    module, require: name => name === '../../models' ? { User: {
      normalizeEmail: email => email.trim().toLowerCase(),
      findOne: async ({ where }) => { assert.equal(where.email, user.email); return user; },
    } } : name === '../middlewares/authMiddleware' ? { checkUserEmail() {} } : require(name),
  });
  const handler = module.exports.stack.find(layer => layer.route?.methods.patch).route.stack.at(-1).handle;
  async function update(body) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ body, userEmail: ' LEARNER@example.test ' }, res);
    return res;
  }
  for (const value of [undefined, null, 123, '', '   ', 'A'.repeat(256), 'Line\nBreak', 'Null\0Byte']) {
    assert.equal((await update({ displayName: value })).statusCode, 400);
  }
  assert.equal(saves, 0);
  const valid = await update({ displayName: '  Śrī Kṛṣṇa Dāsa  ' });
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.data.displayName, 'Śrī Kṛṣṇa Dāsa');
  assert.equal(saves, 1);
});
