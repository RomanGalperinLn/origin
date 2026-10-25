// Dev only: fake Gemini + ElevenLabs so Winston can be tested without keys.
// MOCK_DELAY_MS simulates a slow network. Logs each narration context it receives.
import express from 'express';
const app = express();
app.use(express.json({ limit: '1mb' }));
const delay = Number(process.env.MOCK_DELAY_MS ?? 300);
let n = 0;
app.post('/v1beta/models/:model', async (req, res) => {
  const user: string = req.body.contents[0].parts[0].text;
  const ctx = user.match(/Current data:\n([\s\S]*?)\n\n/)?.[1] ?? '{}';
  const data = JSON.parse(ctx);
  n++;
  console.log(`[mock gemini #${n}] step=${data.step} events=${JSON.stringify(data.events)} drivenOrder=${data.driven?.now?.order} controlOrder=${data.control?.now?.order}`);
  await new Promise((r) => setTimeout(r, delay));
  res.json({ candidates: [{ content: { parts: [{ text: `Narration ${n}: at step ${data.step}, driven order is ${data.driven?.now?.order} against ${data.control?.now?.order} in the control.` }] } }] });
});
// 1.5 s of silence as WAV (Chrome sniffs it even when labelled audio/mpeg).
function silentWav(seconds: number): Buffer {
  const rate = 8000, n = rate * seconds, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44); return b;
}
app.post('/v1/text-to-speech/:voice', async (_req, res) => {
  await new Promise((r) => setTimeout(r, delay));
  console.log('[mock tts]');
  res.set('Content-Type', 'audio/mpeg').send(silentWav(1.5));
});
app.listen(9999, () => console.log('mock upstream on :9999'));
