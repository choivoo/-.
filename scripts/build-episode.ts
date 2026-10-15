import { mkdirSync, writeFileSync } from 'node:fs';
import { SCENES, EP_TITLE } from './lib/episodeScript';
import { buildSampleShots } from './lib/sampleShots';
import type { ShotSpec, SceneMeta, EpisodeMeta } from '../src/scenes/types';

const TOTAL = 28800;
const all: ShotSpec[] = [];
const sceneMetas: SceneMeta[] = [];
const report: string[] = [];
let cursor = 0;

for (const sc of SCENES) {
  const target = sc.meta.durationFrames;
  const fixed: ShotSpec[] = sc.embedSample ? buildSampleShots().map((s) => ({ ...s, sceneId: sc.meta.sceneId, shotId: s.shotId.replace('SMP', sc.meta.sceneId + '-X') })) : [];
  const fixedFrames = fixed.reduce((a, s) => a + s.durationFrames, 0);
  const avail = target - fixedFrames;
  const nat = sc.beats.map((b) => Math.round(b.sec * 24));
  const mins = sc.beats.map((b) => b.minFrames?.({ seed: 0 }) ?? 0);
  // scale natural durations to fit; shots with dialogue keep their minimum
  let durs = nat.map((n, i) => Math.max(mins[i], Math.round((n * avail) / nat.reduce((a, b) => a + b, 0))));
  for (let iter = 0; iter < 20; iter++) {
    const diff = avail - durs.reduce((a, b) => a + b, 0);
    if (diff === 0) break;
    const idx = durs.map((d, i) => ({ d, i, slack: d - mins[i] })).filter((x) => diff > 0 || x.slack > 0).sort((a, b) => b.d - a.d);
    if (!idx.length) throw new Error(`scene ${sc.meta.sceneId}: cannot fit (need ${durs.reduce((a, b) => a + b, 0)} have ${avail})`);
    const step = Math.sign(diff) * Math.max(1, Math.floor(Math.abs(diff) / idx.length));
    for (const x of idx) { const nd = Math.max(mins[x.i], durs[x.i] + step); durs[x.i] = nd; }
    const d2 = avail - durs.reduce((a, b) => a + b, 0);
    if (d2 !== 0 && Math.abs(d2) < idx.length) { durs[idx[0].i] = Math.max(mins[idx[0].i], durs[idx[0].i] + d2); }
  }
  const sceneStart = cursor;
  const shots: ShotSpec[] = [];
  const beatShots: ShotSpec[] = sc.beats.map((b, i) => {
    const dur = durs[i];
    const body = b.build(dur, { seed: i });
    return {
      sceneId: sc.meta.sceneId, shotId: '', startFrame: 0, durationFrames: dur, backgroundId: body.backgroundId ?? 'ruins_night',
      characterIds: body.characters.map((c) => c.id), voiceAsset: null, dialogue: [], soundEffects: [], musicCue: null,
      renderStatus: 'pending', fidelity: 'animatic', ...body,
    } as ShotSpec;
  });
  // sample shots come first in S06 (fixed 720f), then generated beats
  shots.push(...fixed, ...beatShots);
  shots.forEach((s, i) => { s.shotId = `${sc.meta.sceneId}-${String(i + 1).padStart(2, '0')}`; s.startFrame = cursor; cursor += s.durationFrames; s.musicCue = { id: 'tension_drone', trackOffset: s.startFrame % 1440, volume: 0.35 }; });
  const sum = shots.reduce((a, s) => a + s.durationFrames, 0);
  if (sum !== target) throw new Error(`scene ${sc.meta.sceneId}: ${sum} != ${target}`);
  sceneMetas.push({ ...sc.meta, startFrame: sceneStart });
  all.push(...shots);
  report.push(`${sc.meta.sceneId} ${sc.meta.title}: ${shots.length} shots, ${sum}f`);
}
if (cursor !== TOTAL) throw new Error(`episode total ${cursor} != ${TOTAL}`);

mkdirSync('episode/EP01/shots', { recursive: true });
for (const sc of SCENES) writeFileSync(`episode/EP01/shots/${sc.meta.sceneId}.json`, JSON.stringify(all.filter((s) => s.sceneId === sc.meta.sceneId), null, 1));
writeFileSync('episode/EP01/shots/all.json', JSON.stringify(all));
const meta: EpisodeMeta = { ...EP_TITLE, fps: 24, width: 1920, height: 1080, totalFrames: TOTAL, scenes: sceneMetas, shotFiles: SCENES.map((s) => `shots/${s.meta.sceneId}.json`) };
writeFileSync('episode/EP01/metadata/episode.json', JSON.stringify(meta, null, 1));

// script + storyboard + audio plan derived from the same data
let md = `# ${EP_TITLE.titleKo}\n\n> 임시 대본(placeholder script) — 음성은 아직 녹음되지 않았으며, 자막·립싱크는 텍스트 기반 임시 처리입니다.\n\n`;
const sb: unknown[] = [];
const audio: { sfx: Record<string, number>; voiceLines: unknown[]; music: string[] } = { sfx: {}, voiceLines: [], music: ['tension_drone (placeholder)'] };
for (const sc of sceneMetas) {
  md += `## ${sc.sceneId} ${sc.title} (${sc.beat})\n_${sc.summary}_\n\n`;
  for (const s of all.filter((x) => x.sceneId === sc.sceneId)) {
    sb.push({ shotId: s.shotId, startFrame: s.startFrame, durationFrames: s.durationFrames, bg: s.backgroundId, chars: s.characterIds, fidelity: s.fidelity, camera: s.cameraKeyframes.map((k) => `f${k.f}:(${Math.round(k.x)},${Math.round(k.y)}) z${k.zoom.toFixed(2)}`), notes: s.notes ?? '' });
    for (const d of s.dialogue) { md += `- **${d.speaker}**: ${d.text}\n`; audio.voiceLines.push({ shotId: s.shotId, f: d.f, speaker: d.speaker, text: d.text, voiceAsset: null, status: 'NOT RECORDED' }); }
    for (const e of s.soundEffects) audio.sfx[e.sound] = (audio.sfx[e.sound] ?? 0) + 1;
  }
  md += '\n';
}
mkdirSync('episode/EP01/script', { recursive: true }); mkdirSync('episode/EP01/storyboard', { recursive: true }); mkdirSync('episode/EP01/audio', { recursive: true });
writeFileSync('episode/EP01/script/script.md', md);
writeFileSync('episode/EP01/storyboard/storyboard.json', JSON.stringify(sb, null, 1));
writeFileSync('episode/EP01/audio/audio_plan.json', JSON.stringify(audio, null, 1));
console.log(report.join('\n'));
console.log(`TOTAL shots ${all.length}, frames ${cursor} (${cursor / 24}s)`);
