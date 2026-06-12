const axios = require('axios');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_CONTEXT_CHARS = 8000;
const MAX_MESSAGE_CHARS = 2000;
const REQUEST_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call OpenAI API with retry logic and timeout
 * Gracefully falls back if API is unavailable
 */
async function askOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!key || key === 'your_openai_api_key') {
    return 'AI responses are disabled. Please configure OPENAI_API_KEY to enable live AI features.';
  }

  let lastError = null;

  // Retry logic for transient failures
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(OPENAI_URL, {
        model,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      }, {
        timeout: REQUEST_TIMEOUT,
        headers: { Authorization: `Bearer ${key}` }
      });

      const reply = response.data?.choices?.[0]?.message?.content;
      if (reply) {
        return reply;
      }

      return 'Unable to generate a response. Please try again.';
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const message = err.message;

      // Log attempt
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[StudyPal] OpenAI API attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${status || message}). Retrying in ${RETRY_DELAY}ms...`
        );
      }

      // Retry on transient errors (503, 429, timeout)
      if (attempt < MAX_RETRIES && (status === 503 || status === 429 || message.includes('timeout'))) {
        await sleep(RETRY_DELAY);
        continue;
      }

      // Don't retry on client errors (400, 401, 403, 404)
      if (status >= 400 && status < 500) {
        console.error(`[StudyPal] OpenAI API client error (${status}):`, message);
        break;
      }

      // On last attempt or permanent error, break
      break;
    }
  }

  // Graceful fallback on all retries exhausted
  if (lastError) {
    const status = lastError.response?.status;
    const message = lastError.message;

    if (status === 503 || status === 429) {
      console.error(
        `[StudyPal] OpenAI API unavailable after ${MAX_RETRIES + 1} attempts. Service may be overloaded.`
      );
      return 'The AI service is temporarily unavailable due to high demand. Please try again in a few moments.';
    }

    if (message.includes('timeout')) {
      console.error('[StudyPal] OpenAI API request timed out after', REQUEST_TIMEOUT, 'ms');
      return 'The AI request timed out. Please try again with a shorter message.';
    }

    console.error('[StudyPal] OpenAI API error:', message);
    return 'An error occurred while processing your request. Please try again.';
  }

  return 'Unable to reach the AI service. Please try again later.';
}

/**
 * Sanitize and validate context notes
 * @param {*} contextNotes - Raw context notes from request
 * @returns {Array} - Safe array of notes with validated fields
 */
function sanitizeContextNotes(contextNotes) {
  // Ensure contextNotes is an array
  if (!Array.isArray(contextNotes)) {
    return [];
  }

  // Filter and sanitize each note
  return contextNotes
    .filter((note) => note && typeof note === 'object')
    .map((note) => {
      const title = typeof note.title === 'string' ? note.title.trim() : 'Untitled Note';
      let content = typeof note.content === 'string' ? note.content.trim() : '';

      if (content.startsWith('{') && content.endsWith('}')) {
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === 'object') {
            content = typeof parsed.notes_markdown === 'string' ? parsed.notes_markdown.trim() : content;
          }
        } catch {
          // Keep original content if parsing fails
        }
      }

      return { title, content };
    })
    .filter((note) => note.title || note.content);
}

function sanitizeConversationHistory(conversationHistory) {
  if (!Array.isArray(conversationHistory)) {
    return [];
  }

  return conversationHistory
    .filter((turn) => turn && typeof turn === 'object')
    .map((turn) => {
      const role = turn.role === 'assistant' ? 'assistant' : 'user';
      const content = typeof turn.content === 'string' ? turn.content.trim().slice(0, MAX_MESSAGE_CHARS) : '';
      return { role, content };
    })
    .filter((turn) => turn.content);
}

function buildHistoryText(conversationHistory = []) {
  const safeHistory = sanitizeConversationHistory(conversationHistory);
  if (safeHistory.length === 0) {
    return '';
  }

  return safeHistory
    .map((turn) => `${turn.role === 'assistant' ? 'AI' : 'USER'}: ${turn.content}`)
    .join('\n\n')
    .slice(0, MAX_CONTEXT_CHARS);
}

/**
 * Build a context-aware prompt that safely injects notes
 * Includes input validation, sanitization, and size limits
 * @param {string} message - User's message/query
 * @param {Array} contextNotes - Array of notes with {id, title, content}
 * @returns {string} - Formatted prompt for Gemini
 */
function buildContextPrompt(message, contextNotes = [], conversationHistory = []) {
  try {
    // Validate and sanitize message
    if (typeof message !== 'string') {
      message = String(message);
    }
    message = message.trim().slice(0, MAX_MESSAGE_CHARS);

    if (!message) {
      return 'You are StudyPal. Please ask a question.';
    }

    // Sanitize context notes
    const safeNotes = sanitizeContextNotes(contextNotes);

    // Build context text with size limit
    let contextText = '';
    if (safeNotes.length > 0) {
      contextText = safeNotes
        .map((note) => `TITLE: ${note.title}\nCONTENT: ${note.content}`)
        .join('\n\n---\n\n')
        .slice(0, MAX_CONTEXT_CHARS);
    }

    const historyText = buildHistoryText(conversationHistory);

    // Return appropriate prompt based on context availability
    if (contextText.length > 0 && historyText.length > 0) {
      return `You are StudyPal, a focused study assistant.

Use ONLY the provided notes to answer the question. Do not restate the full notes. Focus on the user's question and cite relevant details from the notes.

STUDY NOTES:
${contextText}

  CHAT HISTORY:
  ${historyText}

---

USER QUESTION:
${message}

Answer clearly and concisely, based only on the notes provided.`;
    }

    if (historyText.length > 0) {
      return `You are StudyPal, a focused study assistant.

  Use the chat history as context and answer the latest user message clearly and concisely.

  CHAT HISTORY:
  ${historyText}

  ---

  USER QUESTION:
  ${message}

  Answer clearly and concisely.`;
    }

    // Fallback to generic prompt if no context
    return `You are StudyPal, a focused study assistant. Answer clearly and concisely.\n\nUser: ${message}`;
  } catch (err) {
    console.error('[StudyPal] Error building context prompt:', err.message);
    // Fallback: return safe minimal prompt
    return `You are StudyPal. User asked: ${String(message || '').slice(0, 500)}`;
  }
}

function makeFlashcardPrompt(text) {
  if (typeof text !== 'string') {
    text = String(text || '');
  }
  text = text.trim().slice(0, MAX_CONTEXT_CHARS);
  return `Create concise study flashcards from this material. Return JSON array with front and back fields only:\n\n${text}`;
}

module.exports = { askOpenAI, buildContextPrompt, sanitizeContextNotes, sanitizeConversationHistory, makeFlashcardPrompt };
