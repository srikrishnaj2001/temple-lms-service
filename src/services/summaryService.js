const axios = require('axios');

class SummaryService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.model = 'google/gemini-2.5-flash';
    this.maxRetries = 3;
    this.retryDelayBase = 3000;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async makeApiCall(messages, maxTokens = 2048, temperature = 0.5) {
    let lastError = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${this.baseUrl}/chat/completions`,
          {
            model: this.model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: false
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 120000
          }
        );

        return response.data.choices[0]?.message?.content?.trim() || '';
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        const errorData = error.response?.data;

        console.warn(
          `[SummaryService] API call failed (attempt ${attempt + 1}/${this.maxRetries}):`,
          errorData?.error?.message || error.message
        );

        if (status === 429 || status === 502 || status === 503) {
          const delay = this.retryDelayBase * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }

        // Non-retryable error
        if (status === 400) {
          throw error;
        }

        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelayBase * (attempt + 1));
        }
      }
    }

    throw lastError || new Error('API call failed after retries');
  }

  async fetchTranscription(transcriptionUrl) {
    const response = await axios.get(transcriptionUrl, { timeout: 30000 });
    return response.data;
  }

  convertTranscriptionToText(transcriptionData) {
    if (!transcriptionData?.segments) return '';

    return transcriptionData.segments
      .map(s => {
        const mins = Math.floor(s.start / 60);
        const secs = Math.floor(s.start % 60);
        const timestamp = `[${mins}:${String(secs).padStart(2, '0')}]`;
        return `${timestamp} ${s.text.trim()}`;
      })
      .join('\n');
  }

  async generateSummaryFromUrl(transcriptionUrl, videoTitle) {
    const data = await this.fetchTranscription(transcriptionUrl);
    const transcription = this.convertTranscriptionToText(data);
    return this.generateSummaryFromText(transcription, videoTitle);
  }

  async generateSummaryFromText(transcription, videoTitle) {
    if (!this.apiKey) throw new Error('AI summary generation is not configured. Add OPENROUTER_API_KEY on the service or enter a summary manually.');

    if (!transcription || transcription.length < 50) {
      throw new Error('Transcription too short to generate a useful summary');
    }

    const prompt = `Summarize this lecture for a student. Title: "${videoTitle || 'Untitled'}"

Write exactly 3 sections in clean HTML. Stay under 600 words total.

Section 1 — <h3>Overview</h3>
2-3 sentence paragraph: what this lecture teaches and why it matters.

Section 2 — <h3>Core Concepts</h3>
Bullet list of the key concepts taught. For each bullet: name the concept in <strong>, then explain it in one clear sentence. Max 8 bullets.

Section 3 — <h3>Key Takeaways</h3>
4-6 actionable bullet points the student can apply directly.

Rules:
- Never mention the speaker, video, or lecture. Write as direct knowledge.
- Use actual terms and examples from the content.
- HTML only: <h3>, <p>, <ul>, <li>, <strong>, <code>. No markdown.
- Start with <h3>Overview</h3>. No wrapper tags.
- Finish cleanly — do not cut off mid-sentence.

TRANSCRIPTION:
${transcription}`;

    const summary = await this.makeApiCall(
      [{ role: 'user', content: prompt }],
      2048,
      0.4
    );

    // Strip any markdown code fences the model might wrap around HTML
    return summary
      .replace(/^```html?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }
}

module.exports = new SummaryService();
