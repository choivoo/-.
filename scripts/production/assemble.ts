import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { OUT, cachePath, loadShots, writeJsonAtomic } from './common';
import { loadState, summary, syncState } from './state';
import { probe } from './qa';

/** Trim each cut's audio to the exact frame duration (AAC padding would otherwise accumulate across 105 cuts), then join without re-encoding video. */
export function assemble(tag: '720p' | '1080p', opts: { partial?: boolean; name?: string } = {}) {
  const shots = loadShots();
  const missing = shots.filter((s) => !existsSync(cachePath(s, tag)));
  if (missing.length && !opts.partial) return { ok: false as const, reason: `${missing.length} cuts not rendered @${tag} (first: ${missing.slice(0, 5).map((s) => s.shotId).join(', ')})`, missing: missing.map((s) => s.shotId) };
  const norm = `${OUT}/normalized_${tag}`; mkdirSync(norm, { recursive: true });
  const list: string[] = []; let frames = 0;
  for (const s of shots) {
    const src = cachePath(s, tag); if (!existsSync(src)) continue;
    const dst = `${norm}/${s.shotId}.mp4`, dur = (s.durationFrames / 24).toFixed(6);
    if (!existsSync(dst) || !existsSync(`${dst}.src`) ) {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-c:v', 'copy', '-af', `apad,atrim=0:${dur},asetpts=PTS-STARTPTS`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', dur, '-movflags', '+faststart', dst]);
      writeFileSync(`${dst}.src`, src);
    }
    list.push(path.resolve(dst)); frames += s.durationFrames;
  }
  const lf = `${OUT}/concat_${tag}.txt`; writeFileSync(lf, list.map((f) => `file '${f}'`).join('\n'));
  const out = `${OUT}/${opts.name ?? `EP01_WORK_IN_PROGRESS_${tag === '1080p' ? '1080P' : '720P'}${missing.length ? '_PARTIAL' : ''}`}.mp4`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lf, '-c', 'copy', '-movflags', '+faststart', out]);
  const p = probe(out);
  return { ok: true as const, out, expectedFrames: frames, probe: p, includedShots: list.length, missing: missing.map((s) => s.shotId) };
}
