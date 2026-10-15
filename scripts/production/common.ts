import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, openSync, fsyncSync, closeSync } from 'node:fs';
import path from 'node:path';
import type { ShotSpec, EpisodeMeta } from '../../src/scenes/types';
import { CHARACTERS } from '../../src/characters/defs';
import { BACKGROUNDS } from '../../src/scenes/backgrounds';

export const EP = process.env.EP ?? 'EP01';
export const OUT = `renders/${EP}`;
export const PROD = `episode/${EP}/production`;
export const STATE_FILE = `${PROD}/state.json`;
export const CHECKPOINT = 'PRODUCTION_CHECKPOINT.json';

export const STAGES = ['TODO', 'SCRIPT_READY', 'STORYBOARD_READY', 'BLOCKING', 'ANIMATION', 'CLEANUP', 'COLOR', 'COMPOSITING', 'AUDIO', 'QA', 'FINAL'] as const;
export type Stage = (typeof STAGES)[number];
export type RenderState = 'PENDING' | 'RENDERING' | 'VERIFYING' | 'DONE' | 'FAILED' | 'SKIPPED_CACHE';
export type QaVerdict = 'PASS' | 'REVIEW' | 'FAIL';

export function mkdirp(p: string) { mkdirSync(p, { recursive: true }); }
/** Atomic JSON write: temp file + fsync + rename, so a crash never leaves a half-written state file. */
export function writeJsonAtomic(file: string, data: unknown) {
  mkdirp(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 1));
  const fd = openSync(tmp, 'r'); fsyncSync(fd); closeSync(fd);
  renameSync(tmp, file);
}
export const readJson = <T>(file: string, fallback: T): T => { try { return JSON.parse(readFileSync(file, 'utf8')) as T; } catch { return fallback; } };

export const loadShots = (): ShotSpec[] => JSON.parse(readFileSync(`episode/${EP}/shots/all.json`, 'utf8'));
export const loadMeta = (): EpisodeMeta => JSON.parse(readFileSync(`episode/${EP}/metadata/episode.json`, 'utf8'));

function walk(dir: string, out: string[] = []) { for (const f of readdirSync(dir)) { const p = path.join(dir, f); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; }
let engineCache: string | undefined;
export const engineHash = () => engineCache ??= (() => { const h = createHash('sha256'); for (const f of walk('src').filter((x) => !x.startsWith('src/editor')).sort()) h.update(f).update(readFileSync(f)); return h.digest('hex').slice(0, 16); })();
const audioFiles = (name: string) => ['wav', 'mp3', 'ogg'].map((e) => `public/sounds/${name}.${e}`).filter(existsSync);
export const voicePath = (id: string) => ['wav', 'mp3', 'ogg'].map((e) => `public/voices/${id}.${e}`).find(existsSync);
export const dialogueId = (s: ShotSpec, i: number) => `${s.shotId}-D${String(i + 1).padStart(2, '0')}`;

/** Hash of everything that changes the picture/sound of a cut (cut data, character + background definitions, audio files, voices). */
export function contentHash(s: ShotSpec): string {
  const h = createHash('sha256');
  h.update(JSON.stringify({ ...s, startFrame: 0, renderStatus: 'x', musicCue: s.musicCue }));
  for (const t of s.characters) h.update(JSON.stringify(CHARACTERS[t.id]));
  const bg = BACKGROUNDS[s.backgroundId]; h.update(bg ? bg.id + bg.assetStatus + JSON.stringify(bg.grade ?? {}) + JSON.stringify(bg.bounds) : 'missing');
  for (const n of [...s.soundEffects.map((e) => e.sound), s.musicCue?.id ?? '']) for (const f of audioFiles(n)) h.update(readFileSync(f));
  s.dialogue.forEach((_, i) => { const v = voicePath(dialogueId(s, i)); if (v) h.update(readFileSync(v)); });
  return h.digest('hex').slice(0, 12);
}
export const renderHash = (s: ShotSpec, tag: string) => createHash('sha256').update(contentHash(s)).update(engineHash()).update(tag).digest('hex').slice(0, 12);
export const cachePath = (s: ShotSpec, tag: string) => `renders/cache/${EP}_${s.shotId}_${tag}_${renderHash(s, tag)}.mp4`;
export const characterFingerprint = (id: string) => createHash('sha256').update(JSON.stringify(CHARACTERS[id])).digest('hex').slice(0, 10);
