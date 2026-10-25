// Pre-generates chapter 7's narration audio with ElevenLabs (same voice and model as the
// server's /api/tts), so the show never calls an API live. Reads ELEVENLABS_API_KEY (and
// optionally ELEVENLABS_VOICE_ID) from .env; the key never reaches the browser.
//
//   npm run narration            # writes public/narration/evolution/<id>.mp3 and
//                                #   public/narration/modes/<chapter>-<mode>.mp3, each with a manifest.json
//
// Without a key the app still shows every line as a subtitle.

import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NARRATION } from '../src/lineage/narration';
import modes from '../src/data/narration/modes.json';

// The key comes from origin-sim/.env (overriding anything in the shell environment).
config({ path: '.env', override: true });
const KEY = process.env.ELEVENLABS_API_KEY ?? '';
const VOICE = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const BASE = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';
const MODEL = 'eleven_flash_v2_5';


if (!KEY) {
  console.error('ELEVENLABS_API_KEY is not set in origin-sim/.env. Subtitles work without it; add a key to generate audio.');
  process.exit(1);
}

const modeLines: { id: string; text: string }[] = [{ id: 'opening-released', text: modes.opening.released }];
for (const [chapter, lines] of Object.entries(modes.chapters as Record<string, Record<string, string>>))
  for (const [m, text] of Object.entries(lines)) modeLines.push({ id: `${chapter}-${m}`, text });

for (const [OUT, lines] of [
  ['public/narration/evolution', NARRATION],
  ['public/narration/modes', modeLines],
] as const) {
mkdirSync(OUT, { recursive: true });
const done: { id: string; file: string; text: string }[] = [];
for (const line of lines) {
  const res = await fetch(`${BASE}/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': KEY, Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: line.text, model_id: MODEL }),
  });
  if (!res.ok) {
    console.error(`${line.id}: ElevenLabs answered ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const file = `${line.id}.mp3`;
  writeFileSync(`${OUT}/${file}`, Buffer.from(await res.arrayBuffer()));
  done.push({ id: line.id, file, text: line.text });
  console.log(`  ${file}  ${line.text.slice(0, 70)}…`);
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ voice: VOICE, model: MODEL, lines: done }, null, 2) + '\n');
console.log(`Wrote ${done.length} files and ${OUT}/manifest.json`);
}
