// Tiny proxy that holds the API keys. The browser only ever talks to /api/*.
//   POST /api/narrate  { context }            -> { text }
//   POST /api/ask      { question, context }  -> { text }
//   POST /api/tts      { text }               -> audio/mpeg
//   GET  /api/health                          -> which services are configured
// If dist/ exists (npm run build), it is served too, so the demo can run without Vite.

import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 8787);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? '';
// Default: "George", a warm British premade voice.
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const TIMEOUT_MS = 6000;
// Overridable for local testing against a mock; defaults are the real services.
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';

const SYSTEM_PROMPT = `You are Winston, a calm, precise, slightly dry British AI guide, inspired by the AI in
Dan Brown's novel "Origin". You are narrating a live physics simulation for an audience.

The simulation: particles of 6 types interact by simple attraction/repulsion rules. In the
"driven" run, an oscillating energy field pumps energy in; friction dissipates it as heat.
The "control" run is identical but with no energy field. The idea being explored is Jeremy
England's hypothesis of dissipation-driven adaptation: driven matter tends to organise into
structures that absorb and dissipate energy efficiently.

Rules:
- Only describe what the numbers you are given show. Never invent events or values.
- Compare driven and control when relevant.
- Never claim the simulation creates life. Say "structure", "organisation".
  It is a hypothesis, still debated by physicists.
- Do not claim the driven run makes more repeated or copied structures: measured over
  1,200 runs it usually makes fewer, larger ones; its advantage is order.
- 1 to 3 sentences. Plain spoken English, suitable for speech. No lists, no markdown.
- Occasionally (not every time) connect to the theme of time: the arrow of time,
  entropy, where order comes from.`;

const ASK_SUFFIX = `

Answer the user's question using only the given data and general physics knowledge.
If the data doesn't answer it, say so.`;

const METRIC_GUIDE = `How to read the data:
- order: 1 minus compressed/raw size of a coarse picture of the particles; higher = more ordered. About 0.69 is fully random here.
- clusters: groups of touching particles (5 or more); fewer, larger clusters = more organised.
- energyAbsorbed: power taken from the field, averaged over one field period (control has no field, so 0).
- entropyRate: heat released into the surroundings divided by temperature, averaged over one field period.
- step/time: simulation clock. The slider lets the audience move back and forth in time.`;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function gemini(system: string, user: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  const generationConfig: Record<string, unknown> = { temperature: 0.7, maxOutputTokens: 300 };
  // 2.5 models "think" by default, which only adds latency for 3 sentences.
  if (GEMINI_MODEL.includes('2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const res = await withTimeout((signal) =>
    fetch(`${GEMINI_BASE_URL}/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig,
      }),
    }),
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini returned no text');
  // Speech-friendly: no markdown leftovers.
  return text.replace(/[*_#`]/g, '').replace(/\s+/g, ' ');
}

const app = express();
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ gemini: Boolean(GEMINI_API_KEY), tts: Boolean(ELEVENLABS_API_KEY), model: GEMINI_MODEL });
});

app.post('/api/narrate', async (req, res) => {
  try {
    const context = JSON.stringify(req.body.context ?? {}, null, 1);
    const text = await gemini(SYSTEM_PROMPT, `${METRIC_GUIDE}\n\nCurrent data:\n${context}\n\nNarrate what is happening now.`);
    res.json({ text });
  } catch (e) {
    console.warn('[narrate]', (e as Error).message);
    res.status(502).json({ error: (e as Error).message });
  }
});

app.post('/api/ask', async (req, res) => {
  try {
    const question = String(req.body.question ?? '').slice(0, 500);
    if (!question) throw new Error('empty question');
    const context = JSON.stringify(req.body.context ?? {}, null, 1);
    const text = await gemini(
      SYSTEM_PROMPT + ASK_SUFFIX,
      `${METRIC_GUIDE}\n\nCurrent data:\n${context}\n\nThe audience asks: "${question}"`,
    );
    res.json({ text });
  } catch (e) {
    console.warn('[ask]', (e as Error).message);
    res.status(502).json({ error: (e as Error).message });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set');
    const text = String(req.body.text ?? '').slice(0, 1000);
    if (!text) throw new Error('empty text');
    const r = await withTimeout((signal) =>
      fetch(`${ELEVENLABS_BASE_URL}/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY, Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
      }),
    );
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.warn('[tts]', (e as Error).message);
    res.status(502).json({ error: (e as Error).message });
  }
});

const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(dist)) app.use(express.static(dist));

app.listen(PORT, () => {
  console.log(`Origin server on http://localhost:${PORT}`);
  console.log(`  Gemini: ${GEMINI_API_KEY ? GEMINI_MODEL : 'not configured'} · ElevenLabs: ${ELEVENLABS_API_KEY ? 'configured' : 'not configured'}`);
  if (existsSync(dist)) console.log('  Serving dist/ (production build)');
});
