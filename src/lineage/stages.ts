// The 24 key-frame drawings of our lineage, as creature parameters (see creature.ts).
// Our own simple, schematic artwork: proportions loosely follow each group's body plan
// (fossils or living representatives), not any particular museum reconstruction.
// Real sizes differ hugely; every drawing is shown at the same size with a scale bar.

import type { CreatureParams, Limb } from './creature';

const limb = (at: number, depth: number, l1: number, l2: number, foot: number, a1: number, a2: number, w: number): Limb => ({ at, depth, l1, l2, foot, a1, a2, w });
/** A limb that is not there yet: tiny and inside the body, ready to grow out. */
const none = (at: number): Limb => limb(at, 0, 1, 1, 0, -90, 0, 0.6);

const BASE: CreatureParams = {
  spineLen: 140,
  spineAngle: 0,
  spineBend: 0,
  wRear: 20,
  wMid: 26,
  wFront: 22,
  lobes: 0,
  headLen: 48,
  headH: 32,
  cranium: 0,
  snout: 0.4,
  neck: 16,
  neckTilt: 10,
  headFace: 0,
  nucleus: 0,
  front: none(0.85),
  back: none(0.15),
  tailLen: 60,
  tailW: 10,
  tailDroop: 0,
  fin: 0,
  eye: 4,
  grounded: 1,
  body: '#8a7766',
  head: '#8a7766',
  eyeColor: '#1b1410',
};

const make = (o: Partial<CreatureParams>): CreatureParams => {
  const c = { ...BASE, ...o };
  if (!o.head) c.head = c.body;
  return c;
};

export const STAGE_ART: Record<string, CreatureParams> = {
  // 1. A rod-shaped bacterium-like cell with a flagellum (tail). No nucleus (head hidden).
  'first-cells': make({
    spineLen: 46, wRear: 17, wMid: 18, wFront: 17, headLen: 2, headH: 2, nucleus: 1, neck: 0, eye: 0,
    tailLen: 60, tailW: 1.6, tailDroop: 14, body: '#7fd6a3', head: '#7fd6a3', grounded: 0,
  }),
  // 2. A larger round cell with a nucleus (the head, sitting inside) and a short flagellum.
  eukaryote: make({
    spineLen: 6, wRear: 46, wMid: 48, wFront: 46, lobes: 0.12, headLen: 30, headH: 26, nucleus: 1, neck: 0, eye: 0,
    tailLen: 34, tailW: 1.8, tailDroop: 10, body: '#9fd8c0', head: '#8a63c9', grounded: 0,
  }),
  // 3. A clump of cells.
  multicellular: make({
    spineLen: 30, wRear: 46, wMid: 52, wFront: 46, lobes: 1, headLen: 18, headH: 16, nucleus: 1, neck: 0, eye: 0,
    tailLen: 3, tailW: 1, body: '#7cc8a5', head: '#6a52a8', grounded: 0,
  }),
  // 4. A vase-shaped early animal on the sea floor; the "head" is its dark opening at the top.
  'sponge-like': make({
    spineLen: 120, spineAngle: 90, wRear: 22, wMid: 40, wFront: 30, lobes: 0.25, headLen: 50, headH: 14, nucleus: 0, neck: -4,
    neckTilt: 0, snout: 0, eye: 0, tailLen: 3, tailW: 2, body: '#e3a35a', head: '#6b4220', grounded: 1,
  }),
  // 5. A worm-like animal with a front (head, eyespot) and a back.
  'worm-like': make({
    spineLen: 170, spineBend: 0.04, wRear: 7, wMid: 11, wFront: 10, headLen: 22, headH: 20, snout: 0.1, neck: 8, neckTilt: 0,
    eye: 1.8, tailLen: 22, tailW: 6, body: '#e58fa0', grounded: 0.7,
  }),
  // 6. Early jawless fish: streamlined, tail fin, no paired fins yet.
  'jawless-fish': make({
    spineLen: 120, wRear: 10, wMid: 24, wFront: 20, headLen: 36, headH: 32, snout: 0.25, neck: 12, neckTilt: 0, eye: 4.5,
    tailLen: 52, tailW: 10, fin: 18, body: '#8fb3c9', grounded: 0,
  }),
  // 7. Jawed fish: bigger head and jaws, paired fins (future arms and legs).
  'jawed-fish': make({
    spineLen: 140, wRear: 12, wMid: 32, wFront: 28, headLen: 50, headH: 42, snout: 0.5, neck: 16, neckTilt: 0, eye: 5,
    front: limb(0.82, 0.6, 18, 12, 0, -150, 20, 8), back: limb(0.25, 0.6, 12, 8, 0, -155, 15, 6),
    tailLen: 58, tailW: 12, fin: 26, body: '#6f97b8', grounded: 0,
  }),
  // 8. A fish with limb-like front fins and a neck, propping itself up in shallow water.
  fishapod: make({
    spineLen: 170, wRear: 12, wMid: 26, wFront: 24, headLen: 62, headH: 26, snout: 0.75, neck: 22, neckTilt: 4, eye: 5,
    front: limb(0.85, 0.7, 26, 20, 8, -115, -35, 10), back: limb(0.18, 0.6, 14, 10, 2, -150, 10, 8),
    tailLen: 72, tailW: 14, fin: 10, body: '#7d8f5a', grounded: 0.6,
  }),
  // 9. Early four-legged animal: sprawling legs, long tail with a fin remnant.
  tetrapod: make({
    spineLen: 170, wRear: 24, wMid: 30, wFront: 26, headLen: 60, headH: 28, snout: 0.6, neck: 16, neckTilt: 4, eye: 5,
    front: limb(0.85, 0.7, 28, 26, 12, -115, -30, 11), back: limb(0.12, 0.7, 30, 28, 14, -120, -20, 13),
    tailLen: 92, tailW: 20, fin: 6, body: '#6c7f4e',
  }),
  // 10. Early synapsid: lizard-like body plan, legs still sprawling.
  synapsid: make({
    spineLen: 150, wRear: 20, wMid: 26, wFront: 22, headLen: 52, headH: 30, snout: 0.5, neck: 18, neckTilt: 8, eye: 5,
    front: limb(0.85, 0.7, 30, 28, 12, -108, -25, 9), back: limb(0.1, 0.7, 32, 30, 14, -112, -15, 11),
    tailLen: 112, tailW: 16, tailDroop: 8, body: '#a8743f',
  }),
  // 11. Cynodont: legs more under the body, shorter tail, more mammal-like head.
  cynodont: make({
    spineLen: 140, wRear: 22, wMid: 28, wFront: 24, headLen: 54, headH: 32, snout: 0.45, cranium: 0.1, neck: 16, eye: 5,
    front: limb(0.86, 0.7, 30, 28, 12, -96, -12, 9), back: limb(0.1, 0.7, 32, 30, 14, -96, -10, 11),
    tailLen: 72, tailW: 12, tailDroop: 10, body: '#8f6a4a',
  }),
  // 12. Early mammal: small, shrew-like, arched back, legs under the body.
  'early-mammal': make({
    spineLen: 120, spineBend: 0.1, wRear: 26, wMid: 32, wFront: 26, headLen: 48, headH: 32, snout: 0.55, cranium: 0.25,
    neck: 14, neckTilt: -4, eye: 5,
    front: limb(0.85, 0.7, 22, 20, 10, -92, -15, 8), back: limb(0.12, 0.6, 26, 24, 14, -80, -35, 10),
    tailLen: 70, tailW: 8, tailDroop: 12, body: '#8a7766',
  }),
  // 13. Early primate: tree-living, big forward eyes, grasping limbs, long tail.
  'early-primate': make({
    spineLen: 120, spineAngle: 14, spineBend: 0.06, wRear: 22, wMid: 26, wFront: 22, headLen: 42, headH: 36, snout: 0.3,
    cranium: 0.4, neck: 14, neckTilt: -8, headFace: -6, eye: 8,
    front: limb(0.85, 0.6, 32, 30, 12, -84, -22, 8), back: limb(0.1, 0.6, 36, 34, 16, -72, -45, 10),
    tailLen: 120, tailW: 9, tailDroop: 22, body: '#8a6f55',
  }),
  // 14. Early anthropoid: monkey-like, rounder head, flatter face.
  anthropoid: make({
    spineLen: 130, spineAngle: 10, spineBend: 0.05, wRear: 26, wMid: 30, wFront: 26, headLen: 44, headH: 40, snout: 0.25,
    cranium: 0.6, neck: 14, neckTilt: 0, headFace: -4, eye: 7,
    front: limb(0.86, 0.6, 38, 34, 12, -88, -10, 9), back: limb(0.1, 0.6, 40, 38, 16, -75, -40, 11),
    tailLen: 130, tailW: 10, tailDroop: 30, body: '#9a7350',
  }),
  // 15. Ancestor of Old World monkeys and apes: monkey-like, slightly longer face, shorter tail.
  'catarrhine-ancestor': make({
    spineLen: 130, spineAngle: 12, spineBend: 0.05, wRear: 28, wMid: 32, wFront: 28, headLen: 48, headH: 40, snout: 0.35,
    cranium: 0.6, neck: 14, neckTilt: 0, headFace: -4, eye: 6,
    front: limb(0.86, 0.6, 40, 36, 12, -88, -10, 10), back: limb(0.1, 0.6, 40, 38, 16, -75, -40, 12),
    tailLen: 90, tailW: 9, tailDroop: 32, body: '#8c6b4b',
  }),
  // 16. Early ape: no tail, bigger body and brain, longer arms.
  'early-ape': make({
    spineLen: 130, spineAngle: 16, spineBend: 0.04, wRear: 30, wMid: 34, wFront: 32, headLen: 50, headH: 44, snout: 0.3,
    cranium: 0.7, neck: 14, neckTilt: -2, headFace: -4, eye: 6,
    front: limb(0.88, 0.6, 44, 40, 12, -92, -6, 11), back: limb(0.1, 0.6, 40, 36, 16, -76, -40, 13),
    tailLen: 3, tailW: 3, tailDroop: 30, body: '#6f5440',
  }),
  // 17. Last common ancestor with chimpanzees: an ape, partly upright, long arms.
  'chimp-lca': make({
    spineLen: 130, spineAngle: 35, spineBend: 0.03, wRear: 32, wMid: 36, wFront: 36, headLen: 52, headH: 46, snout: 0.35,
    cranium: 0.75, neck: 14, neckTilt: -20, headFace: -4, eye: 6,
    front: limb(0.9, 0.5, 52, 48, 10, -100, 8, 12), back: limb(0.06, 0.5, 44, 40, 18, -70, -40, 14),
    tailLen: 3, tailW: 3, tailDroop: 30, body: '#4f3d32',
  }),
  // 18. Sahelanthropus: an early hominin; flatter face, a little more upright.
  sahelanthropus: make({
    spineLen: 125, spineAngle: 50, spineBend: 0.02, wRear: 32, wMid: 34, wFront: 34, headLen: 52, headH: 46, snout: 0.25,
    cranium: 0.75, neck: 18, neckTilt: -28, headFace: -2, eye: 6,
    front: limb(0.9, 0.4, 48, 44, 10, -98, 6, 11), back: limb(0.05, 0.4, 46, 42, 18, -80, -25, 14),
    tailLen: 3, tailW: 3, tailDroop: 30, body: '#5a4535',
  }),
  // 19. Ardipithecus ramidus: upright on the ground, still a climber.
  ardipithecus: make({
    spineLen: 120, spineAngle: 74, wRear: 30, wMid: 32, wFront: 32, headLen: 50, headH: 46, snout: 0.28, cranium: 0.75,
    neck: 24, neckTilt: -24, eye: 6,
    front: limb(0.9, 0.3, 44, 42, 10, -96, 4, 11), back: limb(0.04, 0.3, 46, 44, 20, -94, -6, 17),
    tailLen: 3, tailW: 3, tailDroop: 30, body: '#6a4e3a',
  }),
  // 20. Australopithecus afarensis ("Lucy"): walked upright; small brain, long arms.
  afarensis: make({
    spineLen: 110, spineAngle: 86, wRear: 30, wMid: 32, wFront: 28, headLen: 50, headH: 48, snout: 0.3, cranium: 0.8,
    neck: 30, neckTilt: -6, eye: 6,
    front: limb(0.9, 0.2, 40, 38, 10, -96, 5, 11), back: limb(0.03, 0.2, 50, 48, 20, -92, -2, 17),
    tailLen: 3, tailW: 3, tailDroop: 30, body: '#7a5a42',
  }),
  // 21. Homo habilis: upright, bigger braincase, smaller face.
  habilis: make({
    spineLen: 115, spineAngle: 88, wRear: 28, wMid: 30, wFront: 28, headLen: 52, headH: 52, snout: 0.2, cranium: 0.95,
    neck: 32, neckTilt: -4, eye: 6,
    front: limb(0.9, 0.2, 40, 38, 10, -95, 5, 11), back: limb(0.03, 0.2, 54, 52, 20, -91, -2, 17),
    tailLen: 3, tailW: 3, tailDroop: 30, body: '#8a6448',
  }),
  // 22. Homo erectus: tall, long legs, long low braincase.
  erectus: make({
    spineLen: 130, spineAngle: 90, wRear: 28, wMid: 30, wFront: 30, headLen: 58, headH: 50, snout: 0.15, cranium: 0.85,
    neck: 34, neckTilt: 0, eye: 6,
    front: limb(0.9, 0.2, 44, 42, 10, -94, 4, 11), back: limb(0.03, 0.2, 64, 62, 22, -90, -1, 17),
    tailLen: 3, tailW: 3, tailDroop: 30, body: '#8f6a4c',
  }),
  // 23. Homo heidelbergensis: robust, large braincase.
  heidelbergensis: make({
    spineLen: 135, spineAngle: 90, wRear: 32, wMid: 34, wFront: 34, headLen: 58, headH: 56, snout: 0.12, cranium: 1,
    neck: 34, neckTilt: 0, eye: 6,
    front: limb(0.9, 0.2, 46, 44, 10, -94, 4, 11), back: limb(0.03, 0.2, 64, 62, 22, -90, -1, 17),
    tailLen: 3, tailW: 3, tailDroop: 30, body: '#94704f',
  }),
  // 24. Homo sapiens: high, rounded braincase, flat face.
  sapiens: make({
    spineLen: 135, spineAngle: 90, wRear: 26, wMid: 28, wFront: 31, headLen: 54, headH: 58, snout: 0.05, cranium: 1.1,
    neck: 36, neckTilt: 0, eye: 6,
    front: limb(0.9, 0.2, 46, 44, 10, -94, 4, 11), back: limb(0.03, 0.2, 66, 64, 22, -90, -1, 17),
    tailLen: 3, tailW: 3, tailDroop: 30, body: '#a67b5b',
  }),
};

export const STAGE_ORDER = Object.keys(STAGE_ART);
