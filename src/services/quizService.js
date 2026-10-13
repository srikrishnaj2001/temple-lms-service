const axios = require('axios');
const { Content, Course, Module } = require('../../models');
const { getGumletAsset } = require('../utils/gumlet-assets');
const summaryService = require('./summaryService');

/**
 * QuizService — generate quizzes from lesson content using an LLM.
 *
 * Mirrors summaryService.js: OpenRouter + Gemini 2.5 Flash + retry/backoff.
 *
 * Pipeline:
 *   1. Fetch the Content (lesson) + its polymorphic payload (Video/Audio/Read/Resource).
 *   2. Build context text — summary is primary, raw transcript/body added up to 8000 chars.
 *   3. Call LLM with a strict JSON schema prompt.
 *   4. Parse + validate the response.
 *   5. Return a draft quiz object. Caller persists it in a transaction.
 *
 * Lesson-type eligibility (the gate for the "Generate Quiz" button):
 *   - VIDEO    → always, once summary exists
 *   - AUDIO    → when transcript or summary exists
 *   - READ     → always (body is required)
 *   - RESOURCE → when summary exists AND sub-type is PDF or TEXT
 *   - Otherwise → not eligible; UI should not show the button
 */
class QuizService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.model = 'google/gemini-2.5-flash';
    this.maxRetries = 3;
    this.retryDelayBase = 3000;
    this.rawContentCap = 40000; // chars of raw transcript/body/PDF text — ~15 pages at normal density
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Decide whether a lesson is eligible for AI quiz generation.
   * @returns {{ eligible: boolean, reason?: string }}
   */
  async checkEligibility(contentId) {
    const content = await Content.findByPk(contentId);
    if (!content) return { eligible: false, reason: 'Lesson not found' };

    const payload = await content.getContentData();
    if (!payload) return { eligible: false, reason: 'Lesson payload missing' };

    switch (content.contentType) {
      case 'VIDEO': {
        // Eligible if Gumlet has the video (we fetch subtitles live at
        // generation time), OR if a summary/transcript is already cached
        // locally. Covers both the production case (Gumlet-first) and the
        // seed/legacy case (admin manually pasted a summary).
        const hasGumlet = !!payload.externalVideoId;
        const hasLocalText = (payload.summary?.length ?? 0) >= 200 ||
                             (payload.transcript?.length ?? 0) >= 500;
        return (hasGumlet || hasLocalText)
          ? { eligible: true }
          : { eligible: false, reason: 'No Gumlet asset or local summary available' };
      }
      case 'AUDIO': {
        const hasGumlet = !!payload.externalAudioId;
        const hasLocalText = (payload.summary?.length ?? 0) >= 200 ||
                             (payload.transcript?.length ?? 0) >= 500;
        return (hasGumlet || hasLocalText)
          ? { eligible: true }
          : { eligible: false, reason: 'Audio needs Gumlet transcription, a transcript, or a summary' };
      }
      case 'READ': {
        const hasText = (payload.body?.length ?? 0) >= 500 ||
                        (payload.summary?.length ?? 0) >= 200;
        return hasText
          ? { eligible: true }
          : { eligible: false, reason: 'Article body too short' };
      }
      case 'RESOURCE': {
        const resourceType = payload.type; // PDF / IMAGE / URL / TEXT
        if (resourceType === 'IMAGE' || resourceType === 'URL') {
          return { eligible: false, reason: 'No quiz for image/URL resources' };
        }
        // Eligible if we have extracted PDF text, OR an admin-written summary.
        const hasExtractedText = (payload.extractedText?.length ?? 0) >= 200;
        const hasSummary = (payload.summary?.length ?? 0) >= 200;
        if (!hasExtractedText && !hasSummary) {
          return {
            eligible: false,
            reason: resourceType === 'PDF'
              ? 'PDF text extraction still in progress — try again in a moment'
              : 'Resource needs a summary first',
          };
        }
        return { eligible: true };
      }
      default:
        return { eligible: false, reason: 'Unknown lesson type' };
    }
  }

  /**
   * Fetch the Gumlet transcription for a video/audio asset and format it as
   * plain timestamped text. Returns null if transcription isn't available.
   *
   * No DB side effects — the transcript is used in-memory for quiz context
   * only. If/when we want to populate Video.transcript, that should be a
   * separate explicit admin action, not a quiz-generation side effect.
   */
  async fetchGumletTranscript(externalAssetId) {
    if (!externalAssetId) return null;
    try {
      const asset = await getGumletAsset(externalAssetId);
      const url = asset?.output?.transcription_word_level_timestamps;
      if (!url) return null;
      const data = await summaryService.fetchTranscription(url);
      const text = summaryService.convertTranscriptionToText(data);
      return (text && text.length >= 100) ? text : null;
    } catch (err) {
      console.warn(`[QuizService] Gumlet transcript fetch failed for ${externalAssetId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Build the LLM input context from a lesson.
   * Summary first (always), then capped raw content as supplementary detail.
   * For VIDEO/AUDIO we fetch the transcript LIVE from Gumlet (no reliance on
   * the local DB column) so quizzes work for every Gumlet-backed lesson,
   * even ones that were never passed through the summary pipeline.
   */
  async buildContext(contentId) {
    const content = await Content.findByPk(contentId);
    const payload = await content.getContentData();

    const parts = [];
    const title = payload.title || 'Lesson';
    parts.push(`LESSON TITLE: ${title}`);

    if (payload.summary) {
      parts.push(`SUMMARY:\n${payload.summary}`);
    }
    if (payload.description) {
      parts.push(`DESCRIPTION:\n${payload.description}`);
    }

    switch (content.contentType) {
      case 'VIDEO': {
        // Prefer Gumlet (always fresh). Fall back to local transcript column
        // only if Gumlet has nothing (older/manually-populated videos).
        const gumletText = await this.fetchGumletTranscript(payload.externalVideoId);
        const transcript = gumletText || payload.transcript || null;
        if (transcript) {
          parts.push(`TRANSCRIPT (excerpt):\n${transcript.slice(0, this.rawContentCap)}`);
        }
        break;
      }
      case 'AUDIO': {
        const gumletText = await this.fetchGumletTranscript(payload.externalAudioId);
        const transcript = gumletText || payload.transcript || null;
        if (transcript) {
          parts.push(`TRANSCRIPT (excerpt):\n${transcript.slice(0, this.rawContentCap)}`);
        }
        break;
      }
      case 'READ':
        if (payload.body) {
          parts.push(`ARTICLE BODY (excerpt):\n${payload.body.slice(0, this.rawContentCap)}`);
        }
        break;
      case 'RESOURCE': {
        // For PDFs: use the extracted text (pdfExtractService populates it in
        // the background on upload). Falls back to summary + description if
        // extraction hasn't run or failed (scanned PDFs, protected PDFs).
        if (payload.extractedText) {
          parts.push(`PDF CONTENT (excerpt):\n${payload.extractedText.slice(0, this.rawContentCap)}`);
        }
        break;
      }
    }

    return { context: parts.join('\n\n'), title };
  }

  buildPrompt(context, questionCount, difficulty) {
    const difficultyDescription = {
      EASY: 'surface-level recall questions. Vocabulary and simple facts.',
      MEDIUM: 'applied understanding. Requires reasoning about the material.',
      HARD: 'deep inference. Learner must connect multiple ideas or apply to new scenarios.',
      MIXED: `a balanced mix — roughly ${Math.ceil(questionCount * 0.3)} easy, ${Math.ceil(questionCount * 0.5)} medium, ${Math.floor(questionCount * 0.2)} hard.`,
    }[difficulty] || 'a balanced mix.';

    return `You are generating a quiz for a Hindu temple training LMS. The learners are temple volunteers studying devotional practice, seva, and operational procedures.

LESSON CONTEXT:
${context}

TASK:
Generate exactly ${questionCount} multiple-choice questions testing understanding of this lesson. Difficulty: ${difficultyDescription}

STRICT RULES:
- Each question has 4 options, exactly 1 correct.
- Pull wrong answers from plausible misconceptions, not nonsense or jokes.
- Avoid "All of the above" and "None of the above".
- Avoid trick wording — test knowledge, not reading comprehension of the question.
- Questions must be answerable from the lesson content above. Do NOT introduce outside facts.
- Explanation (1-2 sentences) should justify WHY the correct answer is correct, briefly.
- All text in English. Keep questions concise (under 25 words). Keep options concise (under 15 words).

RESPONSE FORMAT:
Return ONLY a JSON array. No prose, no code fences, no commentary. Shape:

[
  {
    "prompt": "What is the first step in...",
    "options": [
      { "text": "Light the lamps", "isCorrect": false },
      { "text": "Clean the altar", "isCorrect": true },
      { "text": "Decorate the deity", "isCorrect": false },
      { "text": "Prepare prasadam", "isCorrect": false }
    ],
    "explanation": "The altar is cleaned before placing any items on it — standard temple etiquette."
  }
]`;
  }

  async makeApiCall(messages, maxTokens = 4096, temperature = 0.4) {
    let lastError = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${this.baseUrl}/chat/completions`,
          { model: this.model, messages, temperature, max_tokens: maxTokens, stream: false },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 120000,
          },
        );
        return response.data.choices[0]?.message?.content?.trim() || '';
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        console.warn(
          `[QuizService] API call failed (attempt ${attempt + 1}/${this.maxRetries}):`,
          error.response?.data?.error?.message || error.message,
        );
        if (status === 429 || status === 502 || status === 503) {
          await this.sleep(this.retryDelayBase * Math.pow(2, attempt));
          continue;
        }
        if (status === 400) throw error;
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelayBase * (attempt + 1));
        }
      }
    }
    throw lastError || new Error('Quiz LLM call failed after retries');
  }

  /**
   * Parse LLM response and validate shape. Throws if malformed.
   */
  parseResponse(raw, expectedCount) {
    // Strip common fence patterns the model sometimes adds despite instructions.
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(`LLM returned non-JSON response: ${err.message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error('LLM response is not a JSON array');
    }

    const questions = parsed.filter((q, i) => {
      if (!q || typeof q.prompt !== 'string') return false;
      if (!Array.isArray(q.options) || q.options.length !== 4) return false;
      const correctCount = q.options.filter(o => o && o.isCorrect === true).length;
      if (correctCount !== 1) return false;
      return q.options.every(o => o && typeof o.text === 'string' && o.text.length > 0);
    });

    if (questions.length === 0) {
      throw new Error('LLM returned no valid questions');
    }
    // Trim to expected count if the model over-generated.
    return questions.slice(0, expectedCount);
  }

  // ===========================================================================
  // Course-level (final assessment) methods
  // ===========================================================================

  /**
   * Fetch all lessons under a course in natural reading order (module seq
   * number, then content seq number). Used by the course-level eligibility
   * check and context builder. Attaches each Content's polymorphic payload
   * via the standard Content.getContentData() hook.
   */
  async loadCourseLessons(courseId) {
    const course = await Course.findByPk(courseId, {
      include: [{
        model: Module,
        as: 'modules',
        include: [{ model: Content, as: 'contents' }],
      }],
      order: [
        [{ model: Module, as: 'modules' }, 'sequenceNumber', 'ASC'],
        [{ model: Module, as: 'modules' }, { model: Content, as: 'contents' }, 'sequenceNumber', 'ASC'],
      ],
    });
    if (!course) return null;
    const lessons = [];
    for (const mod of course.modules || []) {
      for (const content of mod.contents || []) {
        lessons.push({ module: mod, content });
      }
    }
    return { course, lessons };
  }

  /**
   * Decide whether a course has enough aggregated content to generate a
   * final assessment. Any course with at least one lesson that passes the
   * per-lesson eligibility check qualifies — the admin decides how useful
   * a one- or two-lesson "final" actually is.
   */
  async checkCourseEligibility(courseId) {
    const loaded = await this.loadCourseLessons(courseId);
    if (!loaded) return { eligible: false, reason: 'Course not found' };
    if (loaded.lessons.length === 0) {
      return { eligible: false, reason: 'Course has no lessons yet' };
    }

    let eligibleCount = 0;
    for (const { content } of loaded.lessons) {
      const r = await this.checkEligibility(content.id);
      if (r.eligible) eligibleCount++;
    }
    if (eligibleCount === 0) {
      return {
        eligible: false,
        reason: 'No lesson in this course has enough content to source questions from yet.',
      };
    }
    return { eligible: true, eligibleLessons: eligibleCount, totalLessons: loaded.lessons.length };
  }

  /**
   * Aggregate text across every lesson in the course. Each lesson's per-lesson
   * context (summary + description + a trimmed excerpt of transcript / body /
   * extracted PDF text) is appended under a "## Module → Lesson" heading so
   * the LLM has structural signposts and can distribute questions across the
   * course rather than clustering on whichever lesson happens to be richest.
   *
   * Per-lesson excerpt is capped more tightly than the lesson-wise builder
   * (perLessonCap) so a 20-lesson course fits comfortably inside Gemini's
   * budget. Global cap (courseContextCap) is a last-resort guardrail.
   */
  async buildCourseContext(courseId) {
    const perLessonCap = 2500;    // chars of raw per-lesson excerpt
    const courseContextCap = 120_000; // ~30k tokens — well under Gemini 2.5 Flash 1M
    const loaded = await this.loadCourseLessons(courseId);
    if (!loaded) throw new Error('Course not found');

    const parts = [];
    parts.push(`COURSE TITLE: ${loaded.course.title}`);
    if (loaded.course.description) parts.push(`COURSE OVERVIEW:\n${loaded.course.description}`);

    for (const { module, content } of loaded.lessons) {
      // Reuse the per-lesson builder — it already handles Gumlet transcript
      // fetch, PDF extracted-text, article body, etc. We just trim its output
      // so the course context stays manageable across many lessons.
      let lessonCtx;
      try {
        lessonCtx = await this.buildContext(content.id);
      } catch {
        continue; // Skip lessons that fail to load (missing payload etc.).
      }
      if (!lessonCtx?.context) continue;
      const trimmed = lessonCtx.context.length > perLessonCap
        ? lessonCtx.context.slice(0, perLessonCap) + '\n...[truncated]'
        : lessonCtx.context;
      parts.push(`\n## Module: ${module.title} → Lesson: ${lessonCtx.title}\n${trimmed}`);
      // Stop early if the aggregate is huge — remaining lessons would be
      // dropped anyway by any hard LLM-input limit.
      if (parts.join('\n\n').length >= courseContextCap) {
        parts.push('\n[Remaining lessons omitted from context — course content exceeds aggregate cap]');
        break;
      }
    }

    return {
      context: parts.join('\n\n').slice(0, courseContextCap),
      title: loaded.course.title,
      lessonCount: loaded.lessons.length,
    };
  }

  buildCoursePrompt(context, courseTitle, questionCount, difficulty) {
    const difficultyDescription = {
      EASY: 'surface-level recall across the course material.',
      MEDIUM: 'applied understanding; questions require reasoning across one or two lessons.',
      HARD: 'synthesis questions requiring the learner to connect ideas from multiple lessons.',
      MIXED: `a balanced mix — roughly ${Math.ceil(questionCount * 0.3)} easy recall, ${Math.ceil(questionCount * 0.5)} applied, ${Math.floor(questionCount * 0.2)} synthesis across lessons.`,
    }[difficulty] || 'a balanced mix.';

    return `You are generating a FINAL COURSE ASSESSMENT for a Hindu temple training LMS. The learners have just completed every lesson in the course "${courseTitle}" and are now being tested on the full material.

COURSE CONTEXT (every lesson, in reading order):
${context}

TASK:
Generate exactly ${questionCount} multiple-choice questions covering the WHOLE course, not just one lesson. Distribute questions across modules so the assessment reflects the full scope of what the learner studied. Difficulty: ${difficultyDescription}

STRICT RULES:
- Each question has 4 options, exactly 1 correct.
- Pull wrong answers from plausible misconceptions, not nonsense.
- Avoid "All of the above" / "None of the above".
- Avoid trick wording — test knowledge, not reading comprehension.
- Every question must be answerable from the course context above. Do NOT introduce outside facts.
- Spread question coverage across at least ${Math.min(5, Math.max(2, Math.floor(questionCount / 3)))} different lessons/modules — this is a FINAL assessment, not a lesson quiz.
- Explanation (1-2 sentences) justifies WHY the correct answer is correct.
- All text in English. Keep questions concise (under 30 words). Keep options concise (under 15 words).

RESPONSE FORMAT:
Return ONLY a JSON array. No prose, no code fences, no commentary. Shape:

[
  {
    "prompt": "Which of these is a core responsibility of the Executive Officer?",
    "options": [
      { "text": "Approving guest-house bookings", "isCorrect": false },
      { "text": "Overseeing all departmental KPIs", "isCorrect": true },
      { "text": "Cooking prasadam", "isCorrect": false },
      { "text": "Managing the website", "isCorrect": false }
    ],
    "explanation": "Per the Strategy & Planning module, the Executive Officer coordinates and reviews departmental KPIs across the organisation."
  }
]`;
  }

  /**
   * Generate a draft final assessment for an entire course. Returns the parsed
   * quiz (not persisted) — route layer handles DB writes.
   */
  async generateCourseDraft({ courseId, questionCount = 15, difficulty = 'MIXED' }) {
    const eligibility = await this.checkCourseEligibility(courseId);
    if (!eligibility.eligible) {
      const err = new Error(eligibility.reason);
      err.code = 'INELIGIBLE';
      throw err;
    }

    const { context, title } = await this.buildCourseContext(courseId);
    const prompt = this.buildCoursePrompt(context, title, questionCount, difficulty);

    // Larger token budget than lesson quizzes — a 25-question final with
    // explanations easily blows past the lesson-quiz 4k default.
    const raw = await this.makeApiCall(
      [
        { role: 'system', content: 'You generate course-wide final assessment questions in strict JSON. No commentary.' },
        { role: 'user', content: prompt },
      ],
      8192,
    );
    const questions = this.parseResponse(raw, questionCount);

    return {
      title: `${title} — Final Assessment`,
      questionCount: questions.length,
      difficulty,
      questions,
    };
  }

  // ===========================================================================
  // Lesson-level entry point (kept at the bottom for parity with course-level).
  // ===========================================================================

  /**
   * Main entry point. Generate a draft quiz for a lesson.
   * Returns the parsed quiz (not persisted) — route layer handles DB writes.
   */
  async generateDraft({ contentId, questionCount = 10, difficulty = 'MIXED' }) {
    const eligibility = await this.checkEligibility(contentId);
    if (!eligibility.eligible) {
      const err = new Error(eligibility.reason);
      err.code = 'INELIGIBLE';
      throw err;
    }

    const { context, title } = await this.buildContext(contentId);
    const prompt = this.buildPrompt(context, questionCount, difficulty);

    const raw = await this.makeApiCall([
      { role: 'system', content: 'You generate quiz questions in strict JSON. No commentary.' },
      { role: 'user', content: prompt },
    ]);

    const questions = this.parseResponse(raw, questionCount);

    return {
      title: `${title} — Quiz`,
      questionCount: questions.length,
      difficulty,
      questions, // [{ prompt, options: [{text, isCorrect}], explanation }]
    };
  }
}

module.exports = new QuizService();
