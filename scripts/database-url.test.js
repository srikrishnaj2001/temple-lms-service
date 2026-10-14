'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { apiDatabaseUrl } = require('../config/database-url');

test('production API uses the Supabase transaction endpoint without changing connection details', () => {
  const original = 'postgres://user:pass%40word@aws-0-region.pooler.supabase.com:5432/db?sslmode=require';
  const result = new URL(apiDatabaseUrl(original, 'production'));
  const expected = new URL(original);
  expected.port = '6543';
  assert.equal(result.toString(), expected.toString());
});

test('local, direct, existing transaction, and non-production URLs remain unchanged', () => {
  for (const value of [
    'postgres://user:pass@localhost:5432/db',
    'postgres://user:pass@db.example.supabase.co:5432/db',
    'postgres://user:pass@aws-0-region.pooler.supabase.com:6543/db',
    'postgres://user:pass@pooler.supabase.com.example.test:5432/db',
  ]) assert.equal(apiDatabaseUrl(value, 'production'), value);
  const session = 'postgres://user:pass@aws-0-region.pooler.supabase.com:5432/db';
  assert.equal(apiDatabaseUrl(session, 'development'), session);
  assert.equal(apiDatabaseUrl(session, 'test'), session);
});
