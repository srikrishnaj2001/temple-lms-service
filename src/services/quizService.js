const axios = require('axios');
const { Content } = require('../../models');
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
