// Vercel serverless function: StudyFlow -> Gemini (Google AI Studio)
// API kalit faqat serverda (GEMINI_API_KEY) saqlanadi, brauzerga chiqmaydi.

const { requireUser } = require('../lib/auth');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          q: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          answer: { type: 'INTEGER' },
          explain: { type: 'STRING' },
          topic: { type: 'STRING' }
        },
        required: ['q', 'options', 'answer', 'explain', 'topic']
      }
    }
  },
  required: ['title', 'questions']
};

function buildPrompt(text, count, diff) {
  return (
    'You are a quiz generator for university students. Write ' + count +
    ' multiple-choice questions in Uzbek (Latin script) based on the notes or topic below. Difficulty: ' + diff + '. ' +
    'Each question has exactly 4 options (no letter prefixes), "answer" is the integer index 0-3 of the single correct option, ' +
    '"explain" is 1-2 sentences on why it is correct, "topic" is a short sub-topic label (1-3 words), and "title" is a short quiz title. ' +
    'Distractors must be plausible; vary the position of the correct answer; base the questions on the given text, ' +
    'and if the input is only a topic name, use well-established general knowledge about it.\n\nINPUT:\n' + text
  );
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true, model: MODEL, hasKey: !!process.env.GEMINI_API_KEY, auth: !!process.env.SUPABASE_URL });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'missing_api_key', detail: 'GEMINI_API_KEY topilmadi' });

  const au = await requireUser(req, res);
  if (!au) return;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const text = String(body.text || '').trim().slice(0, 12000);
    const count = Math.min(10, Math.max(1, parseInt(body.count, 10) || 5));
    const diff = ['Oson', 'O‘rta', 'Qiyin'].includes(body.diff) ? body.diff : 'O‘rta';
    if (text.length < 3) return res.status(400).json({ error: 'empty_input' });

    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(text, count, diff) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
            temperature: 0.7
          }
        })
      }
    );

    if (!r.ok) {
      const t = await r.text();
      console.error('Gemini error', r.status, t);
      let detail = t;
      try { detail = JSON.parse(t).error.message; } catch (e) {}
      return res.status(r.status === 429 ? 429 : 502).json({ error: 'gemini_error', detail: String(detail).slice(0, 200) });
    }

    const data = await r.json();
    const out = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (!out) return res.status(502).json({ error: 'empty_answer' });

    return res.status(200).json(JSON.parse(out));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server_error', detail: String((e && e.message) || e).slice(0, 200) });
  }
};
