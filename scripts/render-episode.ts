/**
 * Cut-by-cut episode renderer with content-hash cache, batching, failure isolation and FFmpeg concat.
 *   tsx scripts/render-episode.ts [--scene S01] [--shots A,B] [--720] [--batch 4] [--limit N] [--retry-failed] [--concat] [--partial] [--clean]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderComp } from './render-lib';
import type { ShotSpec } from '../src/scenes/types';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const epId = opt('episode') ?? 'EP01';
const res = flag('720') ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };
const tag = `${res.height}p`;
const batch = Number(opt('batch') ?? 4);
const shotsFile = `episode/${epId}/shots/${epId === 'EP01' ? 'all' : 'shots'}.json`;
const all: ShotSpec[] = JSON.parse(readFileSync(shotsFile, 'utf8'));
mkdirSync('renders/cache', { recursive: true });
const statusFile = `renders/status_${epId}_${tag}.json`;
const status: Record<string, { status: 'rendered' | 'failed' | 'cached'; hash: string; error?: string; seconds?: number }> = existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, 'utf8')) : {};

function walk(dir: string, out: string[] = []) { for (const f of readdirSync(dir)) { const p = path.join(dir, f); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; }
const engineHash = (() => { const h = createHash('sha256'); for (const f of walk('src').sort()) h.update(f).update(readFileSync(f)); return h.digest('hex').slice(0, 16); })();
const assetHash = (names: string[]) => { const h = createHash('sha256'); for (const n of names) { for (const e of ['wav', 'mp3', 'ogg']) { const p = `public/sounds/${n}.${e}`; if (existsSync(p)) h.update(readFileSync(p)); } } return h.digest('hex').slice(0, 8); };
const hashOf = (s: ShotSpec) => createHash('sha256').update(JSON.stringify({ ...s, startFrame: 0, renderStatus: 'x' })).update(engineHash).update(tag).update(assetHash([...s.soundEffects.map((e) => e.sound), s.musicCue?.id ?? ''])).digest('hex').slice(0, 12);
const cachePath = (s: ShotSpec, h: string) => `renders/cache/${epId}_${s.shotId}_${tag}_${h}.mp4`;
const save = () => writeFileSync(statusFile, JSON.stringify(status, null, 1));

let todo = all;
if (opt('scene')) todo = todo.filter((s) => s.sceneId === opt('scene'));
if (opt('shots')) { const set = new Set(opt('shots')!.split(',')); todo = todo.filter((s) => set.has(s.shotId)); }
if (flag('retry-failed')) todo = todo.filter((s) => status[s.shotId]?.status === 'failed');
if (opt('limit')) todo = todo.slice(0, Number(opt('limit')));

if (!flag('concat-only')) {
  let done = 0, cached = 0, failed = 0;
  for (let i = 0; i < todo.length; i += batch) {
    for (const s of todo.slice(i, i + batch)) {
      const h = hashOf(s), out = cachePath(s, h);
      if (existsSync(out) && statSync(out).size > 1000 && !flag('force')) { status[s.shotId] = { status: 'cached', hash: h }; cached++; console.log(`[cache] ${s.shotId}`); continue; }
      const t0 = Date.now();
      try {
        const tmp = out + '.part.mp4';
        await renderComp({ comp: 'Shot', props: { shot: s, badge: !flag('clean') }, out: tmp, ...res, concurrency: Number(opt('concurrency') ?? 3) });
        execFileSync('mv', [tmp, out]);
        status[s.shotId] = { status: 'rendered', hash: h, seconds: (Date.now() - t0) / 1000 }; done++;
        console.log(`[ok]    ${s.shotId} ${s.durationFrames}f in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } catch (e) {
        status[s.shotId] = { status: 'failed', hash: h, error: String((e as Error).message ?? e).slice(0, 500) }; failed++;
        console.log(`[FAIL]  ${s.shotId}: ${status[s.shotId].error}`);
      }
      save();
    }
  }
  console.log(`rendered ${done}, cached ${cached}, failed ${failed} of ${todo.length}`);
}

if (flag('concat') || flag('concat-only')) {
  const have = all.map((s) => ({ s, p: cachePath(s, hashOf(s)) }));
  const missing = have.filter((x) => !existsSync(x.p));
  if (missing.length && !flag('partial')) { console.log(`concat refused: ${missing.length} shots not rendered (use --partial to join what exists). First missing: ${missing.slice(0, 5).map((x) => x.s.shotId).join(', ')}`); process.exit(2); }
  const list = have.filter((x) => existsSync(x.p));
  const listFile = `renders/concat_${epId}_${tag}.txt`;
  writeFileSync(listFile, list.map((x) => `file '${path.resolve(x.p)}'`).join('\n'));
  const out = `renders/${epId}_${tag}${missing.length ? '_PARTIAL' : ''}.mp4`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out]);
  console.log(`concatenated ${list.length}/${all.length} shots -> ${out}`);
}
