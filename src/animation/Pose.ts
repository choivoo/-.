/** Pose = numeric parameter vector for the 2D rig. Angles in degrees, forward (+x of the facing direction) is positive. */
export interface Pose {
  /** horizontal root offset in character space (px) */
  x: number;
  /** extra vertical lift above ground (px, positive = up). Feet are auto-grounded otherwise. */
  air: number;
  hips: number; lean: number; head: number; headTurn: number;
  shR: number; elR: number; wrR: number;
  shL: number; elL: number; wrL: number;
  hipR: number; knR: number; ftR: number;
  hipL: number; knL: number; ftL: number;
  /** sword angle relative to right hand */
  weapon: number;
  /** 0 = sheathed, 1 = drawn (threshold 0.5) */
  drawn: number;
  squashY: number; stretchX: number;
  /** coat / cloth lift 0..1 */
  coat: number;
  /** hair blow 0..1 */
  hair: number;
  /** smear amount 0..1 (stretches limbs along motion) */
  smear: number;
  /** replacement-drawing variant id (0 = default) */
  variant: number;
}

export const POSE_KEYS = [
  'x', 'air', 'hips', 'lean', 'head', 'headTurn', 'shR', 'elR', 'wrR', 'shL', 'elL', 'wrL',
  'hipR', 'knR', 'ftR', 'hipL', 'knL', 'ftL', 'weapon', 'drawn', 'squashY', 'stretchX', 'coat', 'hair', 'smear', 'variant',
] as const satisfies readonly (keyof Pose)[];

export const IDLE_POSE: Pose = {
  x: 0, air: 0, hips: 0, lean: 3, head: 0, headTurn: 0.35,
  shR: 8, elR: 18, wrR: 0, shL: -4, elL: 22, wrL: 0,
  hipR: 7, knR: -5, ftR: 0, hipL: -9, knL: -8, ftL: 0,
  weapon: 0, drawn: 0, squashY: 1, stretchX: 1, coat: 0.05, hair: 0.05, smear: 0, variant: 0,
};

export type PartialPose = Partial<Pose>;

export function applyPose(base: Pose, p: PartialPose): Pose {
  return { ...base, ...p };
}

export function mixPose(a: Pose, b: Pose, w: number): Pose {
  const out = { ...a } as Pose;
  for (const k of POSE_KEYS) {
    if (k === 'variant') { out.variant = w < 0.5 ? a.variant : b.variant; continue; }
    out[k] = a[k] + (b[k] - a[k]) * w;
  }
  return out;
}
