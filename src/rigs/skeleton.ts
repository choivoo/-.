import type { Pose } from '../animation/Pose';

/** Named part hierarchy with pivots. Child pivots are expressed in the parent's local space. */
export interface PartNode { id: string; parent: string | null; pivot: [number, number]; z: number; length?: number }

export const BONE = { upperArm: 60, foreArm: 56, thigh: 94, shin: 90, torso: 92, headCenterY: -40, bladeLen: 190 };
export const PELVIS_Y = -190;

export const PART_TREE: PartNode[] = [
  { id: 'pelvis', parent: null, pivot: [0, PELVIS_Y], z: 0 },
  // legs (L = far, R = near)
  { id: 'thighL', parent: 'pelvis', pivot: [-8, 0], z: -2, length: BONE.thigh },
  { id: 'shinL', parent: 'thighL', pivot: [0, BONE.thigh], z: 0, length: BONE.shin },
  { id: 'footL', parent: 'shinL', pivot: [0, BONE.shin], z: 0.1 },
  { id: 'thighR', parent: 'pelvis', pivot: [7, 0], z: -1, length: BONE.thigh },
  { id: 'shinR', parent: 'thighR', pivot: [0, BONE.thigh], z: 0, length: BONE.shin },
  { id: 'footR', parent: 'shinR', pivot: [0, BONE.shin], z: 0.1 },
  { id: 'sheath', parent: 'pelvis', pivot: [-12, -4], z: 0.5 },
  // torso
  { id: 'torso', parent: 'pelvis', pivot: [0, -6], z: 1, length: BONE.torso },
  { id: 'coat', parent: 'torso', pivot: [0, 0], z: 0.3 },
  { id: 'accessory', parent: 'torso', pivot: [4, -90], z: 0.6 },
  // arms
  { id: 'upperArmL', parent: 'torso', pivot: [-9, -86], z: -1, length: BONE.upperArm },
  { id: 'foreArmL', parent: 'upperArmL', pivot: [0, BONE.upperArm], z: 0, length: BONE.foreArm },
  { id: 'handL', parent: 'foreArmL', pivot: [0, BONE.foreArm], z: 0.1 },
  { id: 'upperArmR', parent: 'torso', pivot: [8, -86], z: 1, length: BONE.upperArm },
  { id: 'foreArmR', parent: 'upperArmR', pivot: [0, BONE.upperArm], z: 0, length: BONE.foreArm },
  { id: 'handR', parent: 'foreArmR', pivot: [0, BONE.foreArm], z: 0.1 },
  { id: 'weapon', parent: 'handR', pivot: [0, 6], z: 0.2, length: BONE.bladeLen },
  // neck + head
  { id: 'neck', parent: 'torso', pivot: [4, -92], z: -0.5 },
  { id: 'head', parent: 'neck', pivot: [2, -12], z: 1 },
  { id: 'hairBack', parent: 'head', pivot: [0, 0], z: -1 },
  { id: 'faceContour', parent: 'head', pivot: [0, 0], z: 0 },
  { id: 'eyeL', parent: 'head', pivot: [-14, -46], z: 0.1 },
  { id: 'eyeR', parent: 'head', pivot: [9, -46], z: 0.1 },
  { id: 'browL', parent: 'head', pivot: [-14, -62], z: 0.2 },
  { id: 'browR', parent: 'head', pivot: [9, -62], z: 0.2 },
  { id: 'mouth', parent: 'head', pivot: [6, -18], z: 0.2 },
  { id: 'hairSide', parent: 'head', pivot: [0, 0], z: 0.5 },
  { id: 'hairFront', parent: 'head', pivot: [0, 0], z: 1 },
  { id: 'headAcc', parent: 'head', pivot: [0, 0], z: 2 },
];
export const PART_BY_ID: Record<string, PartNode> = Object.fromEntries(PART_TREE.map((p) => [p.id, p]));
export const REQUIRED_PARTS = [
  'head', 'hairFront', 'hairSide', 'hairBack', 'faceContour', 'eyeL', 'eyeR', 'browL', 'browR', 'mouth', 'neck', 'torso',
  'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'handL', 'handR', 'pelvis', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR',
  'coat', 'accessory', 'weapon', 'sheath',
];
export const childrenOf = (id: string | null) => PART_TREE.filter((p) => p.parent === id);

export interface Local { x: number; y: number; rot: number }
/** Local transform (translate to pivot then rotate CW degrees) of a node for a pose. accRot = sum of ancestors' CW rotation. */
export function localTransform(node: PartNode, pose: Pose, accRot: number): Local {
  let [x, y] = node.pivot;
  let rot = 0;
  switch (node.id) {
    case 'pelvis': rot = pose.hips; break;
    case 'thighR': rot = -pose.hipR; break;
    case 'thighL': rot = -pose.hipL; break;
    case 'shinR': rot = -pose.knR; break;
    case 'shinL': rot = -pose.knL; break;
    case 'footR': rot = -accRot - pose.ftR; break;
    case 'footL': rot = -accRot - pose.ftL; break;
    case 'sheath': rot = 72; break;
    case 'torso': rot = pose.lean; break;
    case 'upperArmR': rot = -pose.shR; break;
    case 'upperArmL': rot = -pose.shL; break;
    case 'foreArmR': rot = -pose.elR; break;
    case 'foreArmL': rot = -pose.elL; break;
    case 'handR': rot = -pose.wrR; break;
    case 'handL': rot = -pose.wrL; break;
    case 'weapon': rot = -pose.weapon; break;
    case 'neck': rot = -pose.lean * 0.45 + pose.head * 0.3; break;
    case 'head': rot = pose.head * 0.7; break;
    case 'eyeL': case 'browL': x += pose.headTurn * 8 - 2.8; break;
    case 'eyeR': case 'browR': x += pose.headTurn * 8 - 2.8; break;
    case 'mouth': x += pose.headTurn * 9 - 3; break;
    default: break;
  }
  if (node.id === 'torso') y -= 0; 
  return { x, y, rot };
}

export type Mat = [number, number, number, number, number, number];
export const matMul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const matFrom = (l: Local): Mat => {
  const r = (l.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, l.x, l.y];
};
export const matApply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export interface Solved { mats: Record<string, Mat>; groundShift: number }
const solveCache = new Map<string, Solved>();
/** Forward kinematics for the whole tree (mirrors the renderer exactly). groundShift keeps the lowest foot on y=0. */
export function solvePose(pose: Pose): Solved {
  const key = JSON.stringify(pose);
  const hit = solveCache.get(key);
  if (hit) return hit;
  const mats: Record<string, Mat> = {};
  const walk = (parent: string | null, pm: Mat, acc: number) => {
    for (const n of childrenOf(parent)) {
      const l = localTransform(n, pose, acc);
      const m = matMul(pm, matFrom(l));
      mats[n.id] = m;
      walk(n.id, m, acc + l.rot);
    }
  };
  walk(null, [1, 0, 0, 1, 0, 0], 0);
  let low = -Infinity;
  for (const f of ['footL', 'footR']) for (const [px, py] of [[-8, 14], [40, 14]]) low = Math.max(low, matApply(mats[f], px, py)[1]);
  const out = { mats, groundShift: -low };
  if (solveCache.size > 4000) solveCache.clear();
  solveCache.set(key, out);
  return out;
}

/** Character-space (feet at y=0, facing +x) position of a point on a part. */
export function partPoint(pose: Pose, part: string, px: number, py: number): [number, number] {
  const s = solvePose(pose);
  const [x, y] = matApply(s.mats[part], px, py);
  return [x + pose.x, y + s.groundShift - pose.air];
}
export const swordTip = (pose: Pose) => partPoint(pose, 'weapon', 0, BONE.bladeLen);
export const swordBase = (pose: Pose) => partPoint(pose, 'weapon', 0, 20);
