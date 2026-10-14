'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isCompleteQuizSubmission } = require('../src/services/quizSubmission');
const questions = [
  { id: 1, options: [{ id: 11, isCorrect: true }, { id: 12, isCorrect: false }] },
  { id: 2, options: [{ id: 21, isCorrect: true }, { id: 22, isCorrect: false }] },
];

test('a fully submitted final assessment qualifies regardless of correct answers', () => {
  assert.equal(isCompleteQuizSubmission(questions, { 1: 12, 2: 22 }), true);
  assert.equal(isCompleteQuizSubmission(questions, { 1: 11, 2: 21 }), true);
});

test('missing answers, options from another question and empty assessments do not qualify', () => {
  for (const answers of [null, [], {}, { 1: 11 }, { 1: 21, 2: 11 }, { 1: 11, 2: 999 }]) {
    assert.equal(isCompleteQuizSubmission(questions, answers), false);
  }
  assert.equal(isCompleteQuizSubmission([], {}), false);
});
