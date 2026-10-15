import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { ShotView } from '../../src/scenes/ShotView';
import type { ShotSpec } from '../../src/scenes/types';
import { loadShots, loadMeta, contentHash, EP } from './common';
import { loadState, saveState, syncState } from './state';
import { timecode } from '../../src/engine/FrameScheduler';

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
const DIR = `episode/${EP}/storyboard/sheets`;
const TW = 640, TH = 360, CAP = 132, PAD = 20, COLS = 3;

function keyFrame(s: ShotSpec): number { const h = s.hitEvents?.[0]; if (h) return Math.min(s.durationFrames - 1, h.f + 2); const d = s.dialogue[0]; if (d) return Math.min(s.durationFrames - 1, d.f + 10); return Math.floor(s.durationFrames * 0.55); }
const tile = (s: ShotSpec, f: number) => renderToStaticMarkup(<ShotView shot={s} frame={f} opts={{ badge: false, subtitles: false }} />);

function sheetSvg(title: string, shots: ShotSpec[]): { svg: string; w: number; h: number } {
  const rows = Math.ceil(shots.length / COLS), w = COLS * (TW + PAD) + PAD, h = 70 + rows * (TH + CAP + PAD) + PAD;
  let body = `<rect width="${w}" height="${h}" fill="#f4f1ea"/><text x="${PAD}" y="44" font-size="30" font-family="sans-serif" font-weight="700" fill="#222">${esc(title)}</text>`;
  shots.forEach((s, i) => {
    const x = PAD + (i % COLS) * (TW + PAD), y = 70 + Math.floor(i / COLS) * (TH + CAP + PAD);
    const kf = keyFrame(s), cam = s.cameraKeyframes;
    const arrow = cam.length > 1 ? `→ cam ${Math.round(cam[0].x)}→${Math.round(cam[cam.length - 1].x)} z${cam[0].zoom.toFixed(1)}→${cam[cam.length - 1].zoom.toFixed(1)}` : '';
    body += `<g transform="translate(${x} ${y})"><rect width="${TW}" height="${TH}" fill="#000" stroke="#222" stroke-width="3"/><g transform="scale(${TW / 1920})">${tile(s, kf)}</g>`;
    // composition aids: rule of thirds + facing arrows
    body += `<g stroke="#fff" stroke-opacity="0.22"><line x1="${TW / 3}" x2="${TW / 3}" y2="${TH}"/><line x1="${(2 * TW) / 3}" x2="${(2 * TW) / 3}" y2="${TH}"/></g>`;
    const cap = [`${s.shotId}  ${s.shotSize ?? ''}  ${s.durationFrames}f (${(s.durationFrames / 24).toFixed(1)}s)  ${timecode(s.startFrame)}`, `${s.kind ?? ''} · ${s.priority ?? ''} · bg:${s.backgroundId} · ${s.characters.map((c) => c.id + (c.flip ? '←' : '→')).join(' ')}`, esc(s.purpose ?? ''), `${arrow}${s.transition?.inType || s.transition?.outType ? ' · ' + (s.transition.inType ?? '') + '/' + (s.transition.outType ?? '') : ''}`, s.dialogue[0] ? `“${esc(s.dialogue[0].text)}”${s.dialogue.length > 1 ? ` +${s.dialogue.length - 1}` : ''}` : (s.hitEvents?.length ? `collisions: ${s.hitEvents.map((h) => h.kind).join(',')}` : '')];
    cap.forEach((c, k) => { body += `<text x="4" y="${TH + 22 + k * 22}" font-size="${k === 0 ? 18 : 15}" font-family="sans-serif" font-weight="${k === 0 ? 700 : 400}" fill="#222">${esc(c.slice(0, 92))}</text>`; });
    body += '</g>';
  });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`, w, h };
}
const png = (svg: string, png: string, w: number, h: number) => execFileSync('bash', ['scripts/svg2png.sh', svg, png, String(w), String(h)]);

export function generateStoryboards(only?: string[]) {
  mkdirSync(DIR, { recursive: true });
  const shots = loadShots(), meta = loadMeta(), done = new Set<string>();
  const scenes = meta.scenes.filter((sc) => !only || only.includes(sc.sceneId));
  for (const sc of scenes) {
    const ss = shots.filter((s) => s.sceneId === sc.sceneId);
    const { svg, w, h } = sheetSvg(`${meta.titleKo} — ${sc.sceneId} ${sc.title} (${sc.beat})`, ss);
    writeFileSync(`${DIR}/${sc.sceneId}.svg`, svg);
    try { png(`${DIR}/${sc.sceneId}.svg`, `${DIR}/${sc.sceneId}.png`, w, h); } catch (e) { console.log('png failed', sc.sceneId, String(e).slice(0, 100)); }
    if (existsSync(`${DIR}/${sc.sceneId}.png`)) ss.forEach((s) => done.add(s.shotId));
    console.log(`storyboard ${sc.sceneId}: ${ss.length} shots → ${DIR}/${sc.sceneId}.png`);
  }
  // record storyboard hash per cut so edits invalidate it
  const st = loadState();
  for (const id of done) { const s = shots.find((x) => x.shotId === id)!; if (st.shots[id]) st.shots[id].storyboardHash = contentHash(s); }
  saveState(st);
  return done;
}

/** One-page overview: every cut as a thumbnail. */
export function overviewSheet() {
  const shots = loadShots(); const cols = 10, tw = 192, th = 108, rows = Math.ceil(shots.length / cols);
  let body = `<rect width="${cols * (tw + 6) + 6}" height="${rows * (th + 22) + 6}" fill="#111"/>`;
  shots.forEach((s, i) => { const x = 6 + (i % cols) * (tw + 6), y = 6 + Math.floor(i / cols) * (th + 22); body += `<g transform="translate(${x} ${y})"><g transform="scale(${tw / 1920})">${tile(s, keyFrame(s))}</g><text y="${th + 15}" font-size="13" fill="#ddd" font-family="monospace">${s.shotId} ${s.kind ?? ''}</text></g>`; });
  const w = cols * (tw + 6) + 6, h = rows * (th + 22) + 6;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
  writeFileSync(`${DIR}/overview.svg`, svg); png(`${DIR}/overview.svg`, `${DIR}/overview.png`, w, h);
  console.log(`overview → ${DIR}/overview.png`);
}
