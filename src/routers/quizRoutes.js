const express = require('express');
const { QueryTypes } = require('sequelize');
const quizService = require('../services/quizService');
const { isCompleteQuizSubmission } = require('../services/quizSubmission');
const { checkUserEmail } = require('../middlewares/authMiddleware');
const {
  User,
  Quiz,
  QuizQuestion,
  QuizOption,
  QuizAttempt,
  sequelize,
} = require('../../models');

// =============================================================================
// Admin router — mounted at /api/* under adminAuth.requireAdmin (see app.js).
// =============================================================================

const adminQuizRouter = express.Router();

// GET /api/content/:contentId/quiz/eligibility
// Used by admin UI to decide whether to show the "Generate Quiz" button.
adminQuizRouter.get('/content/:contentId/quiz/eligibility', async (req, res) => {
  try {
    const result = await quizService.checkEligibility(Number(req.params.contentId));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/content/:contentId/quiz/generate
// Returns a draft quiz for the admin to review. Not persisted yet.
adminQuizRouter.post('/content/:contentId/quiz/generate', async (req, res) => {
  try {
    const contentId = Number(req.params.contentId);
    const { questionCount = 10, difficulty = 'MIXED' } = req.body || {};
    if (![5, 10, 15, 20].includes(questionCount)) {
      return res.status(400).json({
        success: false,
        error: 'questionCount must be one of 5, 10, 15, 20',
      });
    }
    if (!['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(difficulty)) {
      return res.status(400).json({ success: false, error: 'Invalid difficulty' });
    }
    const draft = await quizService.generateDraft({ contentId, questionCount, difficulty });
    res.json({ success: true, data: draft });
  } catch (err) {
    const status = err.code === 'INELIGIBLE' ? 400 : 500;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});

// POST /api/content/:contentId/quiz — save (or replace) the quiz for a lesson.
adminQuizRouter.post('/content/:contentId/quiz', async (req, res) => {
  const contentId = Number(req.params.contentId);
  const t = await sequelize.transaction();
  try {
    const payload = req.body || {};
    if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'questions[] required' });
    }

    // One active quiz per content — soft-delete any existing one first.
    await Quiz.destroy({ where: { contentId }, transaction: t });

    const quiz = await Quiz.create({
      contentId,
      title: payload.title || 'Quiz',
      description: payload.description || null,
      questionCount: payload.questions.length,
      difficulty: payload.difficulty || 'MIXED',
      passingScore: payload.passingScore ?? 70,
      requirePassToAdvance: payload.requirePassToAdvance ?? false,
      showExplanations: payload.showExplanations ?? true,
      isPublished: payload.isPublished ?? false,
    }, { transaction: t });

    for (let i = 0; i < payload.questions.length; i++) {
      const q = payload.questions[i];
      const question = await QuizQuestion.create({
        quizId: quiz.id,
        prompt: q.prompt,
        explanation: q.explanation || null,
        sequenceNumber: i + 1,
      }, { transaction: t });

      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new Error(`Question ${i + 1} must have at least 2 options`);
      }
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        await QuizOption.create({
          questionId: question.id,
          text: opt.text,
          isCorrect: !!opt.isCorrect,
          sequenceNumber: j + 1,
        }, { transaction: t });
      }
    }

    await t.commit();

    const saved = await Quiz.findByPk(quiz.id, {
      include: [{
        model: QuizQuestion,
        as: 'questions',
        include: [{ model: QuizOption, as: 'options' }],
      }],
      order: [
        [{ model: QuizQuestion, as: 'questions' }, 'sequenceNumber', 'ASC'],
        [{ model: QuizQuestion, as: 'questions' }, { model: QuizOption, as: 'options' }, 'sequenceNumber', 'ASC'],
      ],
    });
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/content/:contentId/quiz — admin fetches with correct answers visible.
adminQuizRouter.get('/content/:contentId/quiz', async (req, res) => {
  try {
    const contentId = Number(req.params.contentId);
    const quiz = await Quiz.findOne({
      where: { contentId },
      include: [{
        model: QuizQuestion,
        as: 'questions',
        include: [{ model: QuizOption, as: 'options' }],
      }],
      order: [
        [{ model: QuizQuestion, as: 'questions' }, 'sequenceNumber', 'ASC'],
        [{ model: QuizQuestion, as: 'questions' }, { model: QuizOption, as: 'options' }, 'sequenceNumber', 'ASC'],
      ],
    });
    res.json({ success: true, data: quiz || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/quizzes/:id — update metadata (publishing, passing score, etc.)
adminQuizRouter.patch('/quizzes/:id', async (req, res) => {
  try {
    const quiz = await Quiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });

    const updatable = ['title', 'description', 'passingScore', 'requirePassToAdvance',
                       'showExplanations', 'isPublished'];
    const changes = {};
    for (const key of updatable) {
      if (key in req.body) changes[key] = req.body[key];
    }
    await quiz.update(changes);
    res.json({ success: true, data: quiz });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/quizzes/:id — soft delete via paranoid.
adminQuizRouter.delete('/quizzes/:id', async (req, res) => {
  try {
    const n = await Quiz.destroy({ where: { id: req.params.id } });
    if (!n) return res.status(404).json({ success: false, error: 'Quiz not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// =============================================================================
// Course-scoped admin routes (final assessment per course)
// =============================================================================

// GET /api/courses/:courseId/quiz/eligibility
// Returns { eligible, reason?, eligibleLessons?, totalLessons? } so the admin
// UI can decide whether to show the "Generate Final Assessment" button.
adminQuizRouter.get('/courses/:courseId/quiz/eligibility', async (req, res) => {
  try {
    const result = await quizService.checkCourseEligibility(Number(req.params.courseId));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/courses/:courseId/quiz/generate
// Build the full-course LLM context + call Gemini. Returns a draft quiz
// (not persisted). Admin reviews questions in the UI, then POSTs to save.
adminQuizRouter.post('/courses/:courseId/quiz/generate', async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    const { questionCount = 15, difficulty = 'MIXED' } = req.body || {};
    if (![10, 15, 20, 25].includes(questionCount)) {
      return res.status(400).json({ success: false, error: 'questionCount must be one of 10, 15, 20, 25' });
    }
    if (!['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(difficulty)) {
      return res.status(400).json({ success: false, error: 'Invalid difficulty' });
    }
    const draft = await quizService.generateCourseDraft({ courseId, questionCount, difficulty });
    res.json({ success: true, data: draft });
  } catch (err) {
    const status = err.code === 'INELIGIBLE' ? 400 : 500;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});

// POST /api/courses/:courseId/quiz — save (or replace) the final assessment.
// Same payload shape as the lesson-scoped endpoint. The DB CHECK constraint
// (quizzes_scope_chk) enforces that only one of content_id / course_id is set.
adminQuizRouter.post('/courses/:courseId/quiz', async (req, res) => {
  const courseId = Number(req.params.courseId);
  const t = await sequelize.transaction();
  try {
    const payload = req.body || {};
    if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'questions[] required' });
    }

    // Soft-delete the existing final (unique partial index enforces at most one
    // active per course). The paranoid delete keeps a historical trail.
    await Quiz.destroy({ where: { courseId }, transaction: t });

    const quiz = await Quiz.create({
      courseId,
      contentId: null,
      title: payload.title || 'Final Assessment',
      description: payload.description || null,
      questionCount: payload.questions.length,
      difficulty: payload.difficulty || 'MIXED',
      passingScore: payload.passingScore ?? 70,
      requirePassToAdvance: payload.requirePassToAdvance ?? false,
      showExplanations: payload.showExplanations ?? true,
      isPublished: payload.isPublished ?? false,
    }, { transaction: t });

    for (let i = 0; i < payload.questions.length; i++) {
      const q = payload.questions[i];
      const question = await QuizQuestion.create({
        quizId: quiz.id,
        prompt: q.prompt,
        explanation: q.explanation || null,
        sequenceNumber: i + 1,
      }, { transaction: t });

      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new Error(`Question ${i + 1} must have at least 2 options`);
      }
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        await QuizOption.create({
          questionId: question.id,
          text: opt.text,
          isCorrect: !!opt.isCorrect,
          sequenceNumber: j + 1,
        }, { transaction: t });
      }
    }

    await t.commit();

    const saved = await Quiz.findByPk(quiz.id, {
      include: [{
        model: QuizQuestion,
        as: 'questions',
        include: [{ model: QuizOption, as: 'options' }],
      }],
      order: [
        [{ model: QuizQuestion, as: 'questions' }, 'sequenceNumber', 'ASC'],
        [{ model: QuizQuestion, as: 'questions' }, { model: QuizOption, as: 'options' }, 'sequenceNumber', 'ASC'],
      ],
    });
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/courses/:courseId/quiz — admin fetches with correct answers visible.
adminQuizRouter.get('/courses/:courseId/quiz', async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    const quiz = await Quiz.findOne({
      where: { courseId },
      include: [{
        model: QuizQuestion,
        as: 'questions',
        include: [{ model: QuizOption, as: 'options' }],
      }],
      order: [
        [{ model: QuizQuestion, as: 'questions' }, 'sequenceNumber', 'ASC'],
        [{ model: QuizQuestion, as: 'questions' }, { model: QuizOption, as: 'options' }, 'sequenceNumber', 'ASC'],
      ],
    });
    res.json({ success: true, data: quiz || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/quizzes — list ALL assessments across the LMS, with lesson /
// module / course context. Used by the admin's Assessments management page.
// Supports simple pagination; filter is intentionally minimal — the admin
// page can slice client-side.
adminQuizRouter.get('/quizzes', async (req, res) => {
  try {
    const { Content, Module, Course } = require('../../models');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    // Pull BOTH lesson-scoped and course-scoped quizzes. We can't make either
    // include `required: true` any more (course quizzes have no Content;
    // lesson quizzes have no direct Course); using LEFT JOINs on both lets
    // Sequelize populate whichever branch is set per row.
    const { rows, count } = await Quiz.findAndCountAll({
      attributes: ['id', 'contentId', 'courseId', 'title', 'questionCount',
                   'difficulty', 'passingScore', 'isPublished',
                   'createdAt', 'updatedAt'],
      include: [
        {
          model: Content,
          as: 'content',
          required: false,
          attributes: ['id', 'contentType', 'contentId'],
          include: [{
            model: Module,
            as: 'module',
            required: false,
            attributes: ['id', 'title'],
            include: [{
              model: Course,
              as: 'course',
              required: false,
              attributes: ['id', 'title'],
            }],
          }],
        },
        {
          model: Course,
          as: 'course',
          required: false,
          attributes: ['id', 'title'],
        },
      ],
      order: [['updatedAt', 'DESC']],
      limit,
      offset,
    });

    // Add a derived `scope` field so the admin table can label each row.
    const quizzes = rows.map((r) => {
      const o = r.toJSON();
      o.scope = o.courseId != null ? 'course' : 'lesson';
      return o;
    });

    res.json({
      success: true,
      data: {
        total: count,
        page,
        limit,
        quizzes,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// Learner router — mounted at /v1/* with checkUserEmail middleware.
// =============================================================================

const learnerQuizRouter = express.Router();

/**
 * Resolve the learner's user ID from the email header. Emails are stored
 * lowercase, and the header carries whatever casing Clerk has on file, so
 * normalize before matching — same as every other learner route.
 */
async function resolveUserId(req, res) {
  const user = await User.findOne({ where: { email: User.normalizeEmail(req.userEmail) } });
  if (!user) {
    res.status(404).json({ success: false, error: 'Learner account not found' });
    return null;
  }
  return user.id;
}

/**
 * A learner may only read or answer assessments inside a course they are
 * actually enrolled in. Every other /v1 route enforces this (see
 * coursesService.getCourseLibrary / updateContentProgress); without it any
 * signed-in learner could pull questions from any published assessment in
 * the LMS by guessing content IDs.
 */
async function isEnrolledInCourse(userId, courseId) {
  const [row] = await sequelize.query(`
    SELECT e.id
    FROM enrollments e
    WHERE e."courseId" = :courseId
      AND e."userId" = :userId
      AND e."deletedAt" IS NULL
    LIMIT 1
  `, { replacements: { courseId, userId }, type: QueryTypes.SELECT });
  return Boolean(row);
}

/**
 * Enrolment check for ANY quiz. Course-scoped quizzes (finals) resolve via
 * their courseId; lesson-scoped quizzes resolve via contents -> modules
 * -> courses. Returns false if the quiz has neither (shouldn't happen —
 * the DB CHECK constraint rules that out).
 */
async function isEnrolledForQuiz(userId, quiz) {
  if (quiz.courseId != null) return isEnrolledInCourse(userId, quiz.courseId);
  if (quiz.contentId != null) return isEnrolledForContent(userId, quiz.contentId);
  return false;
}

/** Same check, resolved through the lesson that owns the assessment. */
async function isEnrolledForContent(userId, contentId) {
  const [row] = await sequelize.query(`
    SELECT e.id
    FROM contents ct
    JOIN modules m ON ct."moduleId" = m.id
    JOIN enrollments e ON e."courseId" = m."courseId"
    WHERE ct.id = :contentId
      AND e."userId" = :userId
      AND e."deletedAt" IS NULL
      AND ct."deletedAt" IS NULL
      AND m."deletedAt" IS NULL
    LIMIT 1
  `, { replacements: { contentId, userId }, type: QueryTypes.SELECT });
  return Boolean(row);
}

const NOT_ENROLLED = { success: false, error: 'You are not enrolled in the course for this assessment' };

// GET /v1/content/:contentId/quiz
// Returns a published quiz WITHOUT revealing which options are correct.
// Learner app renders questions + options; server scores on submit.
learnerQuizRouter.get('/content/:contentId/quiz', checkUserEmail, async (req, res) => {
  try {
    const contentId = Number(req.params.contentId);

    const userId = await resolveUserId(req, res);
    if (!userId) return;
    if (!await isEnrolledForContent(userId, contentId)) {
      return res.status(403).json(NOT_ENROLLED);
    }

    const quiz = await Quiz.findOne({
      where: { contentId, isPublished: true },
      include: [{
        model: QuizQuestion,
        as: 'questions',
        include: [{ model: QuizOption, as: 'options' }],
      }],
      order: [
        [{ model: QuizQuestion, as: 'questions' }, 'sequenceNumber', 'ASC'],
        [{ model: QuizQuestion, as: 'questions' }, { model: QuizOption, as: 'options' }, 'sequenceNumber', 'ASC'],
      ],
    });
    if (!quiz) return res.json({ success: true, data: null });

    const safe = quiz.toJSON();
    safe.questions = (safe.questions || []).map(q => ({
      id: q.id,
      prompt: q.prompt,
      sequenceNumber: q.sequenceNumber,
      options: (q.options || []).map(o => ({
        id: o.id,
        text: o.text,
        sequenceNumber: o.sequenceNumber,
        // is_correct intentionally stripped
      })),
    }));
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /v1/quizzes/:quizId/attempts
// Body: { answers: { questionId: optionId } }
// Server computes score. Returns per-question correctness + explanations.
learnerQuizRouter.post('/quizzes/:quizId/attempts', checkUserEmail, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) { await t.rollback(); return; }

    const quizId = Number(req.params.quizId);
    const { answers } = req.body || {};
    if (!answers || typeof answers !== 'object') {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'answers map required' });
    }

    const quiz = await Quiz.findOne({
      where: { id: quizId, isPublished: true },
      include: [{
        model: QuizQuestion,
        as: 'questions',
        include: [{ model: QuizOption, as: 'options' }],
      }],
      transaction: t,
    });
    if (!quiz) {
      await t.rollback();
      return res.status(404).json({ success: false, error: 'Quiz not found or not published' });
    }

    if (!await isEnrolledForQuiz(userId, quiz)) {
      await t.rollback();
      return res.status(403).json(NOT_ENROLLED);
    }

    if (quiz.courseId != null && !isCompleteQuizSubmission(quiz.questions, answers)) {
      await t.rollback();
      return res.status(400).json({ success: false, error: 'Answer every question before submitting the final assessment' });
    }

    let correctCount = 0;
    const perQuestion = [];
    for (const q of (quiz.questions || [])) {
      const selectedOptionId = Number(answers[q.id]);
      const selected = q.options.find(o => o.id === selectedOptionId);
      const correct = q.options.find(o => o.isCorrect);
      const isCorrect = !!selected && selected.id === correct?.id;
      if (isCorrect) correctCount++;
      perQuestion.push({
        questionId: q.id,
        selectedOptionId: selected?.id ?? null,
        correctOptionId: correct?.id ?? null,
        isCorrect,
        explanation: quiz.showExplanations ? q.explanation : undefined,
      });
    }

    const total = quiz.questions.length;
    const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = scorePercent >= quiz.passingScore;

    const attempt = await QuizAttempt.create({
      quizId,
      userId,
      scorePercent,
      passed,
      answers,
    }, { transaction: t });

    await t.commit();

    res.status(201).json({
      success: true,
      data: {
        attemptId: attempt.id,
        scorePercent,
        passed,
        passingScore: quiz.passingScore,
        correctCount,
        totalQuestions: total,
        perQuestion,
      },
    });
  } catch (err) {
    await t.rollback();
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /v1/courses/:courseId/quiz-content-ids
// Lightweight bulk lookup — returns which contents (lessons) in a course have
// a published quiz. The sidebar uses this to inject virtual quiz rows after
// each quizzable lesson without making N separate calls.
learnerQuizRouter.get('/courses/:courseId/quiz-content-ids', checkUserEmail, async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);

    const userId = await resolveUserId(req, res);
    if (!userId) return;
    if (!await isEnrolledInCourse(userId, courseId)) {
      return res.status(403).json(NOT_ENROLLED);
    }

    const { Content, Module } = require('../../models');
    // Lesson-scoped published quizzes under this course.
    const lessonRows = await Quiz.findAll({
      where: { isPublished: true },
      include: [{
        model: Content,
        as: 'content',
        required: true,
        attributes: ['id'],
        include: [{
          model: Module,
          as: 'module',
          required: true,
          attributes: [],
          where: { courseId },
        }],
      }],
      attributes: ['id', 'contentId'],
    });
    // Course-scoped final assessment (at most one — enforced by partial index).
    const courseFinal = await Quiz.findOne({
      where: { courseId, isPublished: true },
      attributes: ['id', 'title', 'passingScore'],
      include: [{ model: QuizQuestion, as: 'questions', attributes: ['id'],
        include: [{ model: QuizOption, as: 'options', attributes: ['id'] }] }],
    });
    const finalAttempt = courseFinal ? await QuizAttempt.findOne({
      where: { quizId: courseFinal.id, userId },
      attributes: ['answers'],
      order: [['completedAt', 'DESC'], ['id', 'DESC']],
    }) : null;
    res.json({
      success: true,
      data: {
        contentIds: lessonRows.map((r) => r.contentId),
        quizzes: lessonRows.map((r) => ({ contentId: r.contentId, quizId: r.id })),
        courseQuiz: courseFinal ? {
          quizId: courseFinal.id,
          title: courseFinal.title,
          passingScore: courseFinal.passingScore,
          submitted: Boolean(finalAttempt && isCompleteQuizSubmission(courseFinal.questions, finalAttempt.answers)),
        } : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /v1/quizzes/:quizId
// Fetch a published quiz by its id, with correct-answer flags stripped.
// Used by the course-level final assessment runner where the learner starts
// from a quizId (not a contentId). Enforces enrollment via the same
// isEnrolledForQuiz check as the attempt endpoint.
learnerQuizRouter.get('/quizzes/:quizId', checkUserEmail, async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const quiz = await Quiz.findOne({
      where: { id: Number(req.params.quizId), isPublished: true },
      include: [{
        model: QuizQuestion,
        as: 'questions',
        include: [{ model: QuizOption, as: 'options' }],
      }],
      order: [
        [{ model: QuizQuestion, as: 'questions' }, 'sequenceNumber', 'ASC'],
        [{ model: QuizQuestion, as: 'questions' }, { model: QuizOption, as: 'options' }, 'sequenceNumber', 'ASC'],
      ],
    });
    if (!quiz) return res.json({ success: true, data: null });
    if (!await isEnrolledForQuiz(userId, quiz)) {
      return res.status(403).json(NOT_ENROLLED);
    }

    const safe = quiz.toJSON();
    safe.questions = (safe.questions || []).map(q => ({
      id: q.id,
      prompt: q.prompt,
      sequenceNumber: q.sequenceNumber,
      options: (q.options || []).map(o => ({
        id: o.id,
        text: o.text,
        sequenceNumber: o.sequenceNumber,
      })),
    }));
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /v1/quizzes/:quizId/attempts — list my attempts for a quiz.
learnerQuizRouter.get('/quizzes/:quizId/attempts', checkUserEmail, async (req, res) => {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;

    const attempts = await QuizAttempt.findAll({
      where: { quizId: Number(req.params.quizId), userId },
      order: [['completedAt', 'DESC']],
    });
    res.json({ success: true, data: attempts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { adminQuizRouter, learnerQuizRouter };
