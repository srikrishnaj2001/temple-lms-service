'use strict';

function isCompleteQuizSubmission(questions, answers) {
  return Array.isArray(questions) && questions.length > 0 &&
    answers != null && typeof answers === 'object' && !Array.isArray(answers) &&
    questions.every(q => q.options?.some(option => option.id === Number(answers[q.id])));
}

module.exports = { isCompleteQuizSubmission };
