// Dev page (lineage-grid.html): all 24 key-frame drawings side by side, plus part counts.
import { creatureShape, creatureSvg } from '../lineage/creature';
import { STAGE_ART, STAGE_ORDER } from '../lineage/stages';

const grid = document.getElementById('grid')!;
STAGE_ORDER.forEach((id, i) => {
  const p = STAGE_ART[id];
  const counts = creatureShape(p).parts.map((x) => x.length).join('/');
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.innerHTML = `${creatureSvg(p, id)}<div>${i + 1}. ${id} <span style="opacity:.5">${counts}</span></div>`;
  grid.appendChild(cell);
});
