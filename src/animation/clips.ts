import { keyed, procedural, Clip } from './Clip';
import { PartialPose } from './Pose';

/** Sword pose helper: choose shoulder/elbow and the desired absolute blade angle (0=down, 90=forward, 180=up). */
export const sp = (lean: number, sh: number, el: number, blade: number, twoHands = true): PartialPose => ({
  lean, shR: sh, elR: el, weapon: blade - (sh - lean) - el,
  ...(twoHands ? { shL: sh - 6, elL: el + 8 } : {}),
});
const D = Math.PI / 180;
const wave = (t: number, period: number, phase = 0) => Math.sin(((t / period) * 360 + phase) * D);

const idle = procedural('idle', 48, (t) => ({
  lean: 3 + wave(t, 48) * 1.2, shR: 8 + wave(t, 48, 40) * 2, shL: -4 - wave(t, 48, 40) * 2, head: wave(t, 48, 90) * 1.5,
  coat: 0.08 + wave(t, 36) * 0.05, hair: 0.08 + wave(t, 30, 60) * 0.06, squashY: 1 + wave(t, 48, 270) * 0.004,
}));

const walk = procedural('walk', 24, (t) => {
  const s = wave(t, 24), c = wave(t, 24, 90), s2 = wave(t, 24, 180), c2 = wave(t, 24, 270);
  return {
    lean: 7, hipR: 24 * s, knR: -8 - 34 * Math.max(0, c), ftR: -14 * Math.max(0, -s) + 6 * Math.max(0, s),
    hipL: 24 * s2, knL: -8 - 34 * Math.max(0, c2), ftL: -14 * Math.max(0, -s2) + 6 * Math.max(0, s2),
    shR: -20 * s, elR: 22 + 10 * Math.max(0, s), shL: -20 * s2, elL: 22 + 10 * Math.max(0, s2),
    head: -wave(t, 12) * 1, coat: 0.3 + 0.1 * wave(t, 12), hair: 0.25, headTurn: 0.35,
  };
});

const run = procedural('run', 16, (t) => {
  const s = wave(t, 16), c = wave(t, 16, 90), s2 = wave(t, 16, 180), c2 = wave(t, 16, 270);
  return {
    lean: 24, x: 0, air: 7 + 7 * Math.abs(wave(t, 16, 45)),
    hipR: 52 * s, knR: -14 - 92 * Math.max(0, c), ftR: -22 * Math.max(0, -s) + 12 * Math.max(0, s),
    hipL: 52 * s2, knL: -14 - 92 * Math.max(0, c2), ftL: -22 * Math.max(0, -s2) + 12 * Math.max(0, s2),
    shR: -52 * s, elR: 88, shL: -52 * s2, elL: 88,
    head: -6, headTurn: 0.5, coat: 0.85, hair: 0.8, stretchX: 1.02,
  };
});

const turn = keyed('turn', 12, [
  { t: 0, pose: {} },
  { t: 4, pose: { stretchX: 0.35, lean: 8, headTurn: -0.2, hipR: 14, hipL: -14 }, ease: 'in' },
  { t: 8, pose: { stretchX: 0.35, lean: 8, headTurn: 0.3 }, ease: 'hold' },
  { t: 12, pose: { stretchX: 1, lean: 3, headTurn: 0.35, hipR: 7, hipL: -9 }, ease: 'out' },
]);

const jump = keyed('jump', 30, [
  { t: 0, pose: {}, phase: 'anticipation' },
  { t: 6, pose: { lean: 20, hipR: 55, knR: -75, hipL: 45, knL: -80, shR: -40, shL: -35, elR: 40, elL: 40, squashY: 0.94 }, ease: 'out' },
  { t: 9, pose: { lean: 6, hipR: 12, knR: -10, hipL: 6, knL: -6, shR: 110, shL: 100, elR: 20, elL: 20, squashY: 1.06, air: 20, ftR: -30, ftL: -30 }, ease: 'in', phase: 'action' },
  { t: 17, pose: { lean: 12, hipR: 70, knR: -85, hipL: 40, knL: -100, shR: 40, shL: 30, elR: 60, elL: 60, air: 120, squashY: 1, ftR: 0, ftL: 0, coat: 0.7 }, ease: 'out' },
  { t: 30, pose: { lean: 8, hipR: 25, knR: -20, hipL: 10, knL: -15, shR: 70, shL: 60, air: 20, coat: 0.5 }, ease: 'in', phase: 'follow' },
], { impactT: 30 });

const land = keyed('land', 16, [
  { t: 0, pose: { lean: 8, hipR: 25, knR: -20, hipL: 10, knL: -15, shR: 70, shL: 60, air: 20 }, phase: 'impact' },
  { t: 3, pose: { lean: 30, hipR: 70, knR: -110, hipL: 60, knL: -115, shR: 25, shL: 15, elR: 50, elL: 50, squashY: 0.92, coat: 0.9 }, ease: 'out' },
  { t: 8, pose: { lean: 28, hipR: 68, knR: -108, hipL: 58, knL: -112 }, ease: 'linear', phase: 'follow' },
  { t: 16, pose: {}, ease: 'inOut' },
]);

const dodge = keyed('dodge', 20, [
  { t: 0, pose: {}, phase: 'anticipation' },
  { t: 3, pose: { lean: 14, hipR: 32, knR: -52, hipL: -22, knL: -40, squashY: 0.96, x: -6 }, ease: 'out' },
  { t: 7, pose: { lean: -22, x: -70, hipR: 50, knR: -20, hipL: -30, knL: -35, shR: 40, shL: 20, elR: 70, elL: 70, head: -10, air: 14, coat: 0.9, hair: 0.9, smear: 0.6, stretchX: 1.06 }, ease: 'outExpo', phase: 'action' },
  { t: 12, pose: { lean: -14, x: -80, hipR: 38, knR: -30, hipL: -26, knL: -28, air: 0, smear: 0, stretchX: 1 }, ease: 'out' },
  { t: 20, pose: { lean: 6, x: -80, hipR: 20, knR: -30, hipL: -18, knL: -25, shR: 50, elR: 60, shL: 40, elL: 60 }, ease: 'inOut', phase: 'follow' },
]);

const fall = keyed('fall', 26, [
  { t: 0, pose: {}, phase: 'impact' },
  { t: 5, pose: { lean: -30, x: -40, air: 40, hipR: 30, knR: -50, hipL: 10, knL: -60, shR: 120, elR: 20, shL: 100, elL: 30, head: -14, coat: 1, hair: 1 }, ease: 'out' },
  { t: 12, pose: { lean: -75, x: -80, air: 20, hipR: 60, knR: -40, hipL: 40, knL: -20, shR: 150, shL: 150, head: -10 }, ease: 'in', phase: 'action' },
  { t: 18, pose: { lean: -88, x: -90, air: -18, hipR: 90, knR: -10, hipL: 80, knL: -5, shR: 100, shL: 90, elR: 30, elL: 30, head: -4, coat: 0.2, hair: 0.2 }, ease: 'in' },
  { t: 26, pose: { lean: -86, x: -96, air: -18, hipR: 84, knR: -6, hipL: 76, knL: -4, shR: 80, shL: 70, elR: 20, elL: 20, head: -2, coat: 0, hair: 0 }, ease: 'out', phase: 'follow' },
]);

const getUp = keyed('getUp', 40, [
  { t: 0, pose: fall.sample(26) as PartialPose },
  { t: 12, pose: { lean: -50, x: -80, air: -6, hipR: 80, knR: -60, hipL: 40, knL: -100, shR: 40, elR: 80, shL: 30, elL: 80 }, ease: 'inOut', phase: 'anticipation' },
  { t: 24, pose: { lean: 20, x: -70, air: 0, hipR: 70, knR: -110, hipL: 40, knL: -100, shR: 30, elR: 60, shL: 20, elL: 60, squashY: 0.95 }, ease: 'inOut', phase: 'action' },
  { t: 40, pose: { x: -70 }, ease: 'out', phase: 'follow' },
]);

// --- sword work ---------------------------------------------------------------------------------
const STANCE = { ...sp(8, 62, 50, 112), hipR: 30, knR: -34, hipL: -26, knL: -22, headTurn: 0.4 };

const drawSword = keyed('drawSword', 32, [
  { t: 0, pose: {}, phase: 'anticipation' },
  { t: 8, pose: { lean: 10, shL: 30, elL: 40, shR: -40, elR: 80, wrR: 20, hipR: 18, knR: -24, hipL: -18, knL: -18, drawn: 0, headTurn: 0.5 }, ease: 'out' },
  { t: 12, pose: { lean: 14, shR: -48, elR: 86, hipR: 24, knR: -30, drawn: 0 }, ease: 'out' },
  { t: 13, pose: { drawn: 1, shR: -30, elR: 80, weapon: 160, coat: 0.5 }, ease: 'hold', phase: 'action' },
  { t: 20, pose: { ...sp(10, 95, 20, 100), drawn: 1, shL: 20, elL: 60, hipR: 34, knR: -36, hipL: -28, knL: -24, coat: 0.7, hair: 0.6, smear: 0.7 }, ease: 'outExpo' },
  { t: 32, pose: { ...STANCE, drawn: 1, coat: 0.2, hair: 0.2, smear: 0 }, ease: 'out', phase: 'follow' },
]);

const slashH = keyed('slashH', 22, [
  { t: 0, pose: { ...STANCE, drawn: 1 }, phase: 'anticipation' },
  { t: 6, pose: { ...sp(-6, 20, 100, 200), drawn: 1, shL: 10, elL: 110, hipR: 36, knR: -44, hipL: -30, knL: -30, x: -12, head: -4, squashY: 0.98 }, ease: 'out' },
  { t: 9, pose: { ...sp(24, 92, 12, 92), drawn: 1, shL: 84, elL: 24, x: 44, hipR: 52, knR: -58, hipL: -40, knL: -12, coat: 0.9, hair: 0.8, smear: 1, stretchX: 1.07 }, ease: 'outExpo', phase: 'impact' },
  { t: 13, pose: { ...sp(20, 98, 8, 80), drawn: 1, x: 52, smear: 0.2, stretchX: 1.02 }, ease: 'out', phase: 'follow' },
  { t: 22, pose: { ...STANCE, drawn: 1, x: 52, coat: 0.2, smear: 0 }, ease: 'inOut' },
], { impactT: 9 });

const slashV = keyed('slashV', 26, [
  { t: 0, pose: { ...STANCE, drawn: 1 }, phase: 'anticipation' },
  { t: 8, pose: { ...sp(-4, 170, 30, 190), drawn: 1, hipR: 14, knR: -10, hipL: -8, knL: -6, x: -10, coat: 0.5, headTurn: 0.4 }, ease: 'out' },
  { t: 11, pose: { ...sp(26, 96, 4, 84), drawn: 1, hipR: 54, knR: -64, hipL: -36, knL: -10, x: 40, coat: 0.9, hair: 0.9, smear: 1, stretchX: 1.05 }, ease: 'outExpo', phase: 'impact' },
  { t: 16, pose: { ...sp(30, 80, 6, 62), drawn: 1, hipR: 58, knR: -70, x: 46, smear: 0.2 }, ease: 'out', phase: 'follow' },
  { t: 26, pose: { ...STANCE, drawn: 1, x: 46, coat: 0.2, smear: 0 }, ease: 'inOut' },
], { impactT: 11 });

const thrust = keyed('thrust', 22, [
  { t: 0, pose: { ...STANCE, drawn: 1 }, phase: 'anticipation' },
  { t: 7, pose: { ...sp(12, 30, 100, 95), drawn: 1, shL: 28, elL: 100, hipR: 24, knR: -50, hipL: -34, knL: -40, x: -14, squashY: 0.96 }, ease: 'out' },
  { t: 10, pose: { ...sp(30, 90, 2, 92), drawn: 1, shL: 70, elL: 30, x: 64, hipR: 66, knR: -50, hipL: -50, knL: -4, smear: 1, stretchX: 1.12, coat: 0.9 }, ease: 'outExpo', phase: 'impact' },
  { t: 14, pose: { ...sp(30, 92, 2, 92), drawn: 1, x: 70, smear: 0.1 }, ease: 'out', phase: 'follow' },
  { t: 22, pose: { ...STANCE, drawn: 1, x: 70, smear: 0 }, ease: 'inOut' },
], { impactT: 10 });

const guard = keyed('guard', 18, [
  { t: 0, pose: { ...STANCE, drawn: 1 }, phase: 'anticipation' },
  { t: 3, pose: { ...sp(4, 88, 90, 150), drawn: 1, shL: 80, elL: 92, hipR: 38, knR: -44, hipL: -30, knL: -32, squashY: 0.97 }, ease: 'out', phase: 'action' },
  { t: 5, pose: { lean: -6, x: -22, head: -5 }, ease: 'outExpo', phase: 'impact' },
  { t: 10, pose: { lean: 2, x: -26 }, ease: 'out', phase: 'follow' },
  { t: 18, pose: { ...STANCE, drawn: 1, x: -26 }, ease: 'inOut' },
], { impactT: 5 });

const counter = keyed('counter', 24, [
  { t: 0, pose: { ...sp(4, 88, 90, 150), drawn: 1, shL: 80, elL: 92, hipR: 38, knR: -44, hipL: -30, knL: -32 }, phase: 'anticipation' },
  { t: 5, pose: { ...sp(-10, 40, 90, 215), drawn: 1, shL: 30, elL: 100, hipR: 40, knR: -46, hipL: -30, knL: -30, x: -10, head: -6 }, ease: 'out' },
  { t: 8, pose: { ...sp(26, 94, 8, 90), drawn: 1, shL: 88, elL: 22, x: 54, hipR: 56, knR: -62, hipL: -42, knL: -12, coat: 1, hair: 1, smear: 1, stretchX: 1.09 }, ease: 'outExpo', phase: 'impact' },
  { t: 13, pose: { ...sp(22, 100, 8, 74), drawn: 1, x: 62, smear: 0.2, stretchX: 1.02 }, ease: 'out', phase: 'follow' },
  { t: 24, pose: { ...STANCE, drawn: 1, x: 62, smear: 0, coat: 0.2 }, ease: 'inOut' },
], { impactT: 8 });

const stance = procedural('stance', 36, (t) => ({ ...STANCE, drawn: 1, lean: 8 + wave(t, 36) * 1, coat: 0.25 + wave(t, 30) * 0.1, hair: 0.3 + wave(t, 24) * 0.1 }));
const stagger = keyed('stagger', 22, [
  { t: 0, pose: { ...STANCE, drawn: 1 }, phase: 'impact' },
  { t: 3, pose: { ...sp(-14, 40, 70, 130), drawn: 1, x: -36, head: -10, hipR: 34, knR: -30, hipL: -34, knL: -26, coat: 1, hair: 1, squashY: 0.97 }, ease: 'outExpo' },
  { t: 10, pose: { ...sp(-4, 56, 56, 120), drawn: 1, x: -62, head: -4, coat: 0.6 }, ease: 'out', phase: 'follow' },
  { t: 22, pose: { ...STANCE, drawn: 1, x: -66, coat: 0.2, hair: 0.2 }, ease: 'inOut' },
]);
const talk = procedural('talk', 60, (t) => ({ lean: 2 + wave(t, 60) * 1, head: wave(t, 40) * 2.5, shR: 10 + wave(t, 30, 30) * 5, elR: 30 + wave(t, 30) * 10, hair: 0.1, coat: 0.1 }));

export const CLIPS: Record<string, Clip> = Object.fromEntries(
  [idle, walk, run, turn, jump, land, dodge, fall, getUp, drawSword, slashH, slashV, thrust, guard, counter, stance, stagger, talk].map((c) => [c.id, c]),
);
export const REQUIRED_CLIPS = ['idle', 'walk', 'run', 'turn', 'jump', 'land', 'dodge', 'fall', 'getUp', 'drawSword', 'slashH', 'slashV', 'thrust', 'guard', 'counter'];
