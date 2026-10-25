// Writes the 24 key-frame drawings to public/lineage/NN-id.svg from src/lineage/stages.ts.
// Usage: npx tsx scripts/genLineageSvgs.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { creatureSvg } from '../src/lineage/creature';
import { STAGE_ART, STAGE_ORDER } from '../src/lineage/stages';

mkdirSync('public/lineage', { recursive: true });
STAGE_ORDER.forEach((id, i) => {
  const file = `public/lineage/${String(i + 1).padStart(2, '0')}-${id}.svg`;
  writeFileSync(file, creatureSvg(STAGE_ART[id], id));
  console.log(file);
});
