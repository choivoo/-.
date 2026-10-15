import os from 'node:os';
import { existsSync, statfsSync, unlinkSync, renameSync, appendFileSync, mkdirSync } from 'node:fs';
import type { ShotSpec } from '../../src/scenes/types';
import { renderComp } from '../render-lib';
import { OUT, cachePath, loadShots, mkdirp, writeJsonAtomic, readJson } from './common';
import { ShotRecord, loadState, saveState, syncState, note, writeCheckpoint, summary } from './state';
import { runQa } from './qa';

export interface RenderOpts { ids?: string[]; tag: '720p' | '1080p'; force?: boolean; retries?: number; jobs?: number; concurrency?: number; badge?: boolean; frames?: [number, number]; onlyFailed?: boolean; limit?: number }
const PRI: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function resources() {
  const cores = os.cpus().length, freeMem = os.freemem() / 1e9;
  let freeDisk = Infinity; try { const s = statfsSync('.'); freeDisk = (s.bavail * s.bsize) / 1e9; } catch { /* unsupported */ }
  return { cores, freeMemGB: +freeMem.toFixed(1), freeDiskGB: +freeDisk.toFixed(1) };
}
/** Start low, derive from measured resources: ~3 cores and ~3 GB RAM per Chromium render. */
export function chooseConcurrency(requested?: number) {
  const r = resources();
  const tabs = Math.max(1, Math.min(requested ?? r.cores - 1, r.cores - 1, Math.floor(r.freeMemGB / 1.2)));
  return { tabs, ...r };
}

const setStatus = (id: string, tag: string, s: ShotRecord['renderStatus']) => { const st = loadState(); const r = st.shots[id]; if (!r) return; if (tag === '1080p') r.renderStatus1080 = s; else r.renderStatus = s; saveState(st); };

export async function renderShots(o: RenderOpts) {
  syncState();
  const all = loadShots();
  const st0 = loadState();
  let list = all.filter((s) => !o.ids || o.ids.includes(s.shotId));
  if (o.onlyFailed) list = list.filter((s) => (o.tag === '1080p' ? st0.shots[s.shotId]?.renderStatus1080 : st0.shots[s.shotId]?.renderStatus) === 'FAILED');
  list = list.sort((a, b) => (PRI[a.priority ?? 'P2'] ?? 2) - (PRI[b.priority ?? 'P2'] ?? 2) || all.indexOf(a) - all.indexOf(b));
  if (o.limit) list = list.slice(0, o.limit);
  mkdirp('renders/cache'); mkdirp(`${OUT}/logs`); mkdirp(`${OUT}/partial`);
  const res = resources();
  const est = list.reduce((a, s) => a + s.durationFrames, 0) * (o.tag === '1080p' ? 0.35 : 0.15) / 1000; // GB, rough upper bound for h264 cuts
  if (res.freeDiskGB < est + 3) throw new Error(`insufficient disk: ${res.freeDiskGB}GB free, need about ${(est + 3).toFixed(1)}GB — aborting safely before rendering`);
  console.log(`[render] ${list.length} cuts @${o.tag}  cores=${res.cores} freeMem=${res.freeMemGB}GB freeDisk=${res.freeDiskGB}GB`);
  const prevAll = all;
  const counters = { done: 0, cached: 0, failed: 0 };
  let tabs = chooseConcurrency(o.concurrency).tabs;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const out = cachePath(s, o.tag);
    const idx = prevAll.indexOf(s);
    // valid cache?
    if (!o.force && !o.frames && existsSync(out)) {
      const st = loadState(); const q = st.shots[s.shotId]?.qualityResults;
      if (q && q.tag === o.tag && q.checks.some((c) => c.name === 'technical' && c.verdict === 'PASS')) { setStatus(s.shotId, o.tag, 'SKIPPED_CACHE'); counters.cached++; console.log(`[cache] ${s.shotId}`); continue; }
      // exists but unverified/corrupt: verify now, otherwise invalidate
      const qa = runQa(s, out, o.tag, prevAll[idx - 1], prevAll[idx + 1]);
      if (qa.checks.find((c) => c.name === 'technical')?.verdict === 'PASS') { const st2 = loadState(); st2.shots[s.shotId].qualityResults = qa; saveState(st2); setStatus(s.shotId, o.tag, 'SKIPPED_CACHE'); counters.cached++; console.log(`[cache-verified] ${s.shotId}`); continue; }
      unlinkSync(out); console.log(`[cache-invalid] ${s.shotId} removed`);
    }
    const attempts = (o.retries ?? 2) + 1;
    let ok = false, lastErr = '';
    for (let a = 1; a <= attempts && !ok; a++) {
      const t0 = Date.now();
      if (resources().freeMemGB < 1.5) { tabs = 1; console.log('[render] low memory → concurrency 1'); }
      setStatus(s.shotId, o.tag, 'RENDERING');
      writeCheckpoint({ currentShot: s.shotId, phase: `render ${o.tag}`, attempt: a });
      try {
        const [w, h] = o.tag === '720p' ? [1280, 720] : [1920, 1080];
        const tmp = o.frames ? `${OUT}/partial/${s.shotId}_${o.frames[0]}-${o.frames[1]}_${o.tag}.mp4` : out + '.part.mp4';
        await renderComp({ comp: 'Shot', props: { shot: s, badge: o.badge ?? true }, out: tmp, width: w, height: h, concurrency: Math.max(1, a > 1 ? Math.floor(tabs / 2) : tabs), frameRange: o.frames });
        if (o.frames) { console.log(`[ok-partial] ${tmp}`); ok = true; counters.done++; break; }
        setStatus(s.shotId, o.tag, 'VERIFYING');
        renameSync(tmp, out);
        const qa = runQa(s, out, o.tag, prevAll[idx - 1], prevAll[idx + 1]);
        const tech = qa.checks.find((c) => c.name === 'technical')!;
        if (tech.verdict === 'FAIL') throw new Error(`verification failed: ${tech.info}`);
        const st = loadState(); st.shots[s.shotId].qualityResults = qa; st.shots[s.shotId].failed = undefined; saveState(st);
        setStatus(s.shotId, o.tag, 'DONE'); counters.done++; ok = true;
        console.log(`[ok] ${s.shotId} ${s.durationFrames}f ${((Date.now() - t0) / 1000).toFixed(1)}s qa=${qa.verdict}  (${i + 1}/${list.length})`);
      } catch (e) {
        lastErr = String((e as Error).message ?? e).slice(0, 800);
        appendFileSync(`${OUT}/logs/${s.shotId}.log`, `[${new Date().toISOString()}] attempt ${a}/${attempts} ${o.tag}: ${lastErr}\n`);
        if (existsSync(out) ) { try { unlinkSync(out); } catch { /* ignore */ } }
        console.log(`[retry?] ${s.shotId} attempt ${a}/${attempts}: ${lastErr.slice(0, 160)}`);
      }
    }
    if (!ok) {
      counters.failed++;
      const st = loadState(); const r = st.shots[s.shotId]; r.failed = lastErr; if (o.tag === '1080p') r.renderStatus1080 = 'FAILED'; else r.renderStatus = 'FAILED'; note(st, `render failed ${s.shotId}: ${lastErr.slice(0, 120)}`); saveState(st);
    }
    writeCheckpoint({ lastCompletedShot: ok ? s.shotId : undefined, counters, summary: summary(loadState()) });
  }
  syncState();
  console.log(`[render] done=${counters.done} cached=${counters.cached} failed=${counters.failed}`);
  return counters;
}
