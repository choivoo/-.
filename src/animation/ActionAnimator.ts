import { CLIPS } from './clips';
import { IDLE_POSE, Pose, mixPose } from './Pose';
import { smoothstep } from '../utils/math';

/** D. ActionAnimator — plays clip cues with cross-blends so poses never teleport. */
export interface ClipCue {
  /** shot-local frame when the clip starts */
  f: number;
  clip: string;
  /** frames used to blend from the previous clip's pose (default 4; 0 = hard cut for impact frames) */
  blend?: number;
  /** playback speed multiplier */
  speed?: number;
  /** start offset inside the clip (frames) */
  from?: number;
}

export function clipPoseAt(cue: ClipCue, frame: number): Pose {
  const clip = CLIPS[cue.clip];
  if (!clip) throw new Error(`Unknown clip "${cue.clip}"`);
  const t = (frame - cue.f) * (cue.speed ?? 1) + (cue.from ?? 0);
  return clip.sample(t);
}

export function samplePose(cues: ClipCue[] | undefined, frame: number): Pose {
  if (!cues || cues.length === 0) return IDLE_POSE;
  const sorted = cues; // authoring order = time order (validated)
  let idx = -1;
  for (let i = 0; i < sorted.length; i++) if (sorted[i].f <= frame) idx = i;
  if (idx < 0) return clipPoseAt({ ...sorted[0], f: sorted[0].f }, sorted[0].f);
  const cur = sorted[idx];
  const cp = clipPoseAt(cur, frame);
  const b = cur.blend ?? 4;
  const into = frame - cur.f;
  if (idx > 0 && b > 0 && into < b) {
    const prev = clipPoseAt(sorted[idx - 1], frame); // previous clip keeps playing (clamped/looped) during the blend
    return mixPose(prev, cp, smoothstep((into + 1) / (b + 1)));
  }
  return cp;
}

export function clipImpactFrames(cues: ClipCue[]): number[] {
  const out: number[] = [];
  for (const c of cues) { const clip = CLIPS[c.clip]; if (clip?.impactT !== undefined) out.push(c.f + Math.round((clip.impactT - (c.from ?? 0)) / (c.speed ?? 1))); }
  return out;
}
