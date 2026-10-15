import React from 'react';
import { BACKGROUNDS } from './backgrounds';
import { CHARACTERS } from '../characters/defs';
import { CharacterRig2D } from '../rigs/CharacterRig2D';
import { samplePose } from '../animation/ActionAnimator';
import { faceAt, mouthAt, textMouthCues, MouthShape } from '../animation/Face';
import { CadenceOverride, remapTime, scheduleLayer } from '../engine/FrameScheduler';
import { cameraAt, CamState, VIEW_W, VIEW_H } from '../camera/CameraDirector';
import { renderVfx, vfxSpace } from '../effects/VFXComposer';
import { ease, lerp, hashString } from '../utils/math';
import { swordTip, partPoint } from '../rigs/skeleton';
import type { Pose } from '../animation/Pose';
import type { CharacterTrack, ShotSpec } from './types';

export interface ViewOptions { cadence?: CadenceOverride; hidden?: string[]; badge?: boolean; subtitles?: boolean; showSafe?: boolean }
const REF = { x: 1600, y: 540 };

export interface CharState { track: CharacterTrack; x: number; y: number; flip: boolean; pose: Pose; ct: number }
export function trackState(shot: ShotSpec, tr: CharacterTrack, animT: number, override: CadenceOverride, groundY: number): CharState {
  const ct = scheduleLayer(animT, tr.cadence, 'twos', override);
  let x = tr.x, y = tr.y ?? groundY, flip = !!tr.flip;
  const path = tr.path;
  if (path && path.length) {
    const first = path[0];
    x = first.x; y = first.y ?? y; flip = first.flip ?? flip;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (ct >= b.f) { x = b.x; y = b.y ?? y; flip = b.flip ?? flip; continue; }
      if (ct > a.f) { const e = ease(b.ease ?? 'inOut', (ct - a.f) / (b.f - a.f)); x = lerp(a.x, b.x, e); y = lerp(a.y ?? y, b.y ?? a.y ?? y, e); }
      else { x = a.x; y = a.y ?? y; }
      flip = a.flip ?? flip;
      break;
    }
  }
  return { track: tr, x, y, flip, pose: samplePose(tr.animationClips, ct), ct };
}
const charToWorld = (s: { x: number; y: number; flip: boolean; scale: number }, p: [number, number]) => [s.x + (s.flip ? -1 : 1) * p[0] * s.scale, s.y + p[1] * s.scale] as [number, number];

export function layerTransform(cam: CamState, depth: number): string {
  const z = 1 + (cam.zoom - 1) * depth;
  const ex = REF.x + (cam.x - REF.x) * depth, ey = REF.y + (cam.y - REF.y) * depth;
  return `translate(${VIEW_W / 2} ${VIEW_H / 2}) rotate(${cam.rot.toFixed(3)}) scale(${z.toFixed(4)}) translate(${(-ex).toFixed(2)} ${(-ey).toFixed(2)})`;
}

const SUB_FONT = '"Noto Sans CJK KR","Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo","WenQuanYi Zen Hei","Nanum Gothic",sans-serif';
function wrap(text: string, n = 30): string[] {
  const out: string[] = []; let cur = '';
  for (const w of text.split(' ')) { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  return out;
}

export function ShotView({ shot, frame, opts = {} }: { shot: ShotSpec; frame: number; opts?: ViewOptions }) {
  const bg = BACKGROUNDS[shot.backgroundId];
  const override = opts.cadence ?? 'auto';
  const animT = remapTime(frame, shot.timeRemap);
  const camFrame = shot.cameraCadence === 'twos' ? Math.floor(frame / 2) * 2 : frame;
  const hidden = new Set(opts.hidden ?? []);
  const states = shot.characters.filter((t) => t.visible !== false && !hidden.has(t.id)).map((t) => trackState(shot, t, animT, override, bg.groundY));
  const fol = shot.cameraFollow ? states.find((s) => s.track.id === shot.cameraFollow!.char) : undefined;
  const cam = cameraAt({
    rig: { keys: shot.cameraKeyframes, shakes: shot.cameraShake, impactZooms: shot.impactZooms, follow: shot.cameraFollow },
    frame: camFrame, bounds: bg.bounds, followX: fol?.x, followY: fol?.y,
  });
  const lw = 3.2 / Math.pow(cam.zoom, 0.45);
  const under = bg.layers.filter((l) => l.depth <= 1), over = bg.layers.filter((l) => l.depth > 1);
  const world = (vs: 'world' | 'screen') => (shot.vfx ?? []).map((e, i) => (vfxSpace(e) === vs ? renderVfx(e, frame, `v${i}`) : null));
  const worldT = layerTransform(cam, 1);
  const speaking = (id: string): MouthShape | null => {
    for (const d of shot.dialogue) if (d.speaker === id && frame >= d.f && frame < d.f + d.dur) return mouthAt(d.mouthCues ?? textMouthCues(d.text), frame - d.f);
    return null;
  };
  const line = shot.dialogue.find((d) => frame >= d.f && frame < d.f + d.dur);
  const tr = shot.transition ?? {};
  let fade = 0, fadeColor = '#000';
  if (tr.inType && tr.inType !== 'cut' && tr.inFrames && frame < tr.inFrames) { fade = 1 - frame / tr.inFrames; fadeColor = tr.inType === 'fadeWhite' ? '#fff' : '#000'; }
  const oStart = shot.durationFrames - (tr.outFrames ?? 0);
  if (tr.outType && tr.outType !== 'cut' && tr.outFrames && frame >= oStart) { fade = Math.max(fade, (frame - oStart + 1) / tr.outFrames); fadeColor = tr.outType === 'fadeWhite' ? '#fff' : '#000'; }
  const sorted = [...states].sort((a, b) => a.y - b.y);
  const sid = (n: string) => `${shot.shotId}-${n}`;

  const ghosts: React.ReactNode[] = [];
  const trails: React.ReactNode[] = [];
  for (const s of states) {
    const def = CHARACTERS[s.track.id];
    const sc = (s.track.scale ?? 1) * def.height;
    for (const ai of s.track.afterimage ?? []) {
      if (s.ct < ai.from || s.ct > ai.to) continue;
      for (let k = ai.count; k >= 1; k--) {
        const gt = Math.max(0, s.ct - k * ai.gap);
        const gs = trackState(shot, s.track, gt, 'auto', bg.groundY);
        ghosts.push(
          <g key={`g${s.track.id}${k}`} filter={`url(#ghost-${ai.color ?? 'cyan'})`} opacity={ai.opacity * (1 - k / (ai.count + 1))}>
            <CharacterRig2D def={def} pose={gs.pose} face={faceAt(s.track.face, gt, 1)} x={gs.x} y={gs.y} scale={s.track.scale} flip={gs.flip} t={gt} lw={lw} uid={sid(`gh${s.track.id}${k}`)} />
          </g>,
        );
      }
    }
    for (const st of s.track.swordTrail ?? []) {
      if (s.ct < st.from || s.ct > st.to) continue;
      const n = st.frames ?? 5;
      const pts: { a: [number, number]; b: [number, number] }[] = [];
      for (let j = 0; j <= n; j++) {
        const tt = Math.max(0, s.ct - j);
        const g = trackState(shot, s.track, tt, 'auto', bg.groundY);
        if (g.pose.drawn < 0.5) continue;
        const ss = { x: g.x, y: g.y, flip: g.flip, scale: sc };
        pts.push({ a: charToWorld(ss, partPoint(g.pose, 'weapon', 0, 120)), b: charToWorld(ss, swordTip(g.pose)) });
      }
      for (let j = 0; j + 1 < pts.length; j++) {
        const A = pts[j], B = pts[j + 1];
        trails.push(<polygon key={`t${s.track.id}${j}`} points={`${A.a} ${A.b} ${B.b} ${B.a}`} fill={st.color ?? '#bff9ff'} opacity={0.5 * (1 - j / pts.length)} style={{ mixBlendMode: 'screen' }} />);
      }
    }
  }
  const hash = hashString(shot.shotId);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={VIEW_W} height={VIEW_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ background: '#000', display: 'block' }}>
      <defs>
        <filter id="blur30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30" /></filter>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <filter id="whip" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation={`${cam.blur.toFixed(1)} 0`} /></filter>
        <filter id="ghost-cyan"><feColorMatrix type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.9  0 0 0 0 0.9  0 0 0 1 0" /></filter>
        <filter id="ghost-red"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0.15  0 0 0 0 0.3  0 0 0 1 0" /></filter>
        <filter id="ghost-white"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" /></filter>
        <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.75" /></radialGradient>
      </defs>
      <g filter={cam.blur > 0.5 ? 'url(#whip)' : undefined}>
        {under.map((l) => <g key={l.id} transform={layerTransform(cam, l.depth)}>{l.render(frame)}</g>)}
        <g transform={worldT}>
          {ghosts}
          {sorted.map((s) => (
            <CharacterRig2D key={s.track.id} def={CHARACTERS[s.track.id]} pose={s.pose} face={faceAt(s.track.face, s.ct, hashString(s.track.id) + hash, speaking(s.track.id))} x={s.x} y={s.y} scale={s.track.scale} flip={s.flip} t={s.ct} lw={lw} uid={sid(s.track.id)} />
          ))}
          {trails}
          {world('world')}
        </g>
        {over.map((l) => <g key={l.id} transform={layerTransform(cam, l.depth)}>{l.render(frame)}</g>)}
      </g>
      {bg.grade && <rect width={VIEW_W} height={VIEW_H} fill={bg.grade.tint} opacity={bg.grade.opacity} style={{ mixBlendMode: 'overlay' }} />}
      {world('screen')}
      {fade > 0 && <rect width={VIEW_W} height={VIEW_H} fill={fadeColor} opacity={fade} />}
      {shot.title && <text x={VIEW_W / 2} y={VIEW_H / 2} textAnchor="middle" fontSize="72" fill="#fff" fontFamily={SUB_FONT} fontWeight="700" letterSpacing="8">{shot.title}</text>}
      {opts.subtitles !== false && line && (
        <g fontFamily={SUB_FONT} textAnchor="middle" fontSize="44" fontWeight="600">
          {wrap(line.text).map((l, i, arr) => <text key={i} x={VIEW_W / 2} y={VIEW_H - 70 - (arr.length - 1 - i) * 56} fill="#fff" stroke="#000" strokeWidth="8" paintOrder="stroke" strokeLinejoin="round">{l}</text>)}
        </g>
      )}
      {opts.badge && <g fontFamily="monospace" fontSize="20" fill="#ffd34d"><rect x="16" y="16" width="760" height="34" fill="#000" opacity="0.6" /><text x="26" y="40">{shot.fidelity === 'final-draft' ? 'PLACEHOLDER VECTOR ART · TEMP SFX' : shot.fidelity === 'directed' ? 'PLACEHOLDER VECTOR ART · DIRECTED · TTS/SFX TEMP' : 'ANIMATIC · ENVIRONMENT/CAMERA ONLY · PLACEHOLDER'}</text></g>}
    </svg>
  );
}
