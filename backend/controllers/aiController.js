const { askOpenAI, buildContextPrompt, makeFlashcardPrompt } = require('../services/aiService');
const { sendSuccess } = require('../utils/response');

async function chat(req, res, next) {
  try {
    // Validate and extract input
    const { message, contextNotes = [], conversationHistory = [] } = req.body;

    // Ensure message exists and is a string
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        data: {},
        message: 'Message is required and must be a string'
      });
    }

    // Build prompt safely (includes sanitization and error handling)
    const prompt = buildContextPrompt(message, contextNotes, conversationHistory);

    // Call AI service (now returns graceful fallback on failure, never throws)
    const reply = await askOpenAI(prompt);

    sendSuccess(res, { reply }, 'AI response ready');
  } catch (err) {
    // This should rarely happen now, but catch unexpected errors
    console.error('[StudyPal] Chat handler error:', err.message);
    next(err);
  }
}

async function summarize(req, res, next) {
  try {
    if (!req.body.content || typeof req.body.content !== 'string') {
      return res.status(400).json({
        success: false,
        data: {},
        message: 'Content is required'
      });
    }

    // Call AI service with timeout protection
    const summary = await askOpenAI(
      `Summarize these notes into clear study bullets and key takeaways:\n\n${req.body.content}`
    );
    sendSuccess(res, { summary }, 'Summary ready');
  } catch (err) {
    console.error('[StudyPal] Summarize handler error:', err.message);
    next(err);
  }
}

async function flashcards(req, res, next) {
  try {
    if (!req.body.content || typeof req.body.content !== 'string') {
      return res.status(400).json({
        success: false,
        data: {},
        message: 'Content is required'
      });
    }

    // Call AI service with timeout protection
    const cards = await askOpenAI(makeFlashcardPrompt(req.body.content));
    sendSuccess(res, { cards }, 'Flashcards ready');
  } catch (err) {
    console.error('[StudyPal] Flashcards handler error:', err.message);
    next(err);
  }
}

module.exports = { chat, summarize, flashcards };
