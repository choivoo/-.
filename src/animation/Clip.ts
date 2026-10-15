import { IDLE_POSE, Pose, PartialPose, applyPose, mixPose } from './Pose';
import { ease, EaseName } from '../utils/math';

export type Phase = 'anticipation' | 'action' | 'impact' | 'follow';
export interface ClipKey { t: number; pose: PartialPose; ease?: EaseName; phase?: Phase }
export interface Clip {
  id: string;
  duration: number;
  loop: boolean;
  /** frame (clip-local) at which the strike connects, if any */
  impactT?: number;
  phases: { phase: Phase; from: number; to: number }[];
  sample(t: number): Pose;
}

/** Keyed clip: partial poses are forward-filled from the previous key (first key inherits IDLE). */
export function keyed(id: string, duration: number, keys: ClipKey[], opts: { loop?: boolean; impactT?: number } = {}): Clip {
  const resolved: { t: number; pose: Pose; ease?: EaseName; phase?: Phase }[] = [];
  let prev = IDLE_POSE;
  for (const k of keys) { prev = applyPose(prev, k.pose); resolved.push({ t: k.t, pose: prev, ease: k.ease, phase: k.phase }); }
  const phases: Clip['phases'] = [];
  resolved.forEach((k, i) => { if (k.phase) phases.push({ phase: k.phase, from: k.t, to: resolved[i + 1]?.t ?? duration }); });
  return {
    id, duration, loop: !!opts.loop, impactT: opts.impactT, phases,
    sample(t) {
      const tt = this.loop ? ((t % duration) + duration) % duration : Math.min(Math.max(t, 0), duration);
      if (tt <= resolved[0].t) return resolved[0].pose;
      for (let i = 1; i < resolved.length; i++) {
        const a = resolved[i - 1], b = resolved[i];
        if (tt <= b.t) return mixPose(a.pose, b.pose, ease(b.ease ?? a.ease ?? 'inOut', (tt - a.t) / (b.t - a.t)));
      }
      return resolved[resolved.length - 1].pose;
    },
  };
}

export function procedural(id: string, duration: number, fn: (t: number) => PartialPose, loop = true): Clip {
  return { id, duration, loop, phases: [{ phase: 'action', from: 0, to: duration }], sample: (t) => applyPose(IDLE_POSE, fn(loop ? t % duration : Math.min(t, duration))) };
}
