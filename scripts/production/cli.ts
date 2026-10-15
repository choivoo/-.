/**
 * ANIME FORGE — Episode Factory CLI.   npx tsx scripts/production/cli.ts <command> [args]
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { EP, OUT, loadShots, loadMeta, STAGES, cachePath, contentHash, voicePath, dialogueId, writeJsonAtomic, readJson, engineHash } from './common';
import { loadState, saveState, syncState, summary, note, writeCheckpoint, ShotRecord } from './state';
import { renderShots, resources, chooseConcurrency } from './renderManager';
import { runQa, probe } from './qa';
import { assemble } from './assemble';
import { generateStoryboards, overviewSheet } from './storyboard';
import { validateShots, validateCharacters } from '../../src/scenes/validate';
import { soundExists, validateCharacterAssetPaths } from '../lib/fsAssets';
import { CHARACTERS } from '../../src/characters/defs';
import { BACKGROUNDS } from '../../src/scenes/backgrounds';
import { textMouthCues } from '../../src/animation/Face';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n: string) => rest.includes(`--${n}`);
const opt = (n: string) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined; };
const tag = (flag('720') ? '720p' : '1080p') as '720p' | '1080p';
mkdirSync(OUT, { recursive: true });

function status() {
  const st = syncState(); const s = summary(st);
  console.log(`\n${EP}: ${s.shots} cuts, ${s.frames} frames (${(s.frames / 24 / 60).toFixed(2)} min)`);
  console.log('stage        cuts  frames'); for (const k of STAGES) if (s.byStage[k]) console.log(`${k.padEnd(16)} ${String(s.byStage[k]).padStart(3)}  ${s.framesByStage[k]}`);
  console.log(`fidelity: animatic(env-only) ${s.animatic} · directed ${s.directed} · final-draft ${s.finalDraft}`);
  console.log(`render 1080p:`, s.render1080, ` qa:`, s.qa, ` approved: ${s.approved}  missing voice lines: ${s.missingVoiceLines}`);
  if (s.failed.length) console.log('FAILED:', s.failed.join(', '));
  return s;
}

async function main() {
  switch (cmd) {
    case 'audit': {
      const r = resources(); const shots = loadShots(); const meta = loadMeta();
      const issues = [...validateShots(shots, { expectedTotal: meta.totalFrames, scenes: meta.scenes, soundExists }), ...validateCharacters(), ...validateCharacterAssetPaths()];
      const voices = shots.reduce((a, s) => a + s.dialogue.filter((_, i) => voicePath(dialogueId(s, i))).length, 0), lines = shots.reduce((a, s) => a + s.dialogue.length, 0);
      const forge = existsSync('public/characters') ? readdirSync('public/characters').filter((f) => f !== 'README.md') : [];
      const report = { episode: EP, shots: shots.length, frames: shots.reduce((a, s) => a + s.durationFrames, 0), resources: r, concurrencyPlan: chooseConcurrency(), engineHash: engineHash(), characters: Object.values(CHARACTERS).map((c) => ({ id: c.id, assetStatus: c.assetStatus, overrides: Object.keys(c.overrides).length })), backgrounds: Object.values(BACKGROUNDS).map((b) => ({ id: b.id, layers: b.layers.length, assetStatus: b.assetStatus })), characterForge2Assets: forge.length ? forge : 'NOT FOUND (public/characters has no character folders)', voice: { lines, linked: voices, missing: lines - voices, tts: 'no usable Korean TTS engine installed (espeak-ng/festival/piper/TTS not found)' }, issues };
      writeJsonAtomic(`${OUT}/audit.json`, report); console.log(JSON.stringify(report, null, 1).slice(0, 3500));
      writeCheckpoint({ phase: 'audit', lastAudit: new Date().toISOString(), auditIssues: issues.length });
      process.exit(issues.some((i) => i.level === 'error') ? 1 : 0);
    }
    case 'status': status(); break;
    case 'audio': {
      // Audio Director: dialogue extraction, lip-sync + subtitle data, voice linking, track classification
      const TRACK: Record<string, string> = { step: 'Foley', whoosh: 'Foley', draw: 'Foley', hit_clash: 'Impact SFX', hit_heavy: 'Impact SFX', crack: 'Impact SFX', rumble: 'Ambient', wind_loop: 'Ambient', heartbeat: 'Ambient', tension_drone: 'Music' };
      const shots = loadShots(); const lines: unknown[] = []; const tracks: Record<string, Record<string, number>> = {};
      for (const s of shots) {
        s.dialogue.forEach((d, i) => { const id = dialogueId(s, i), v = voicePath(id); lines.push({ dialogueId: id, shotId: s.shotId, characterId: d.speaker, text: d.text, startFrame: d.f, durationFrames: d.dur, emotion: s.characters.find((c) => c.id === d.speaker)?.face?.filter((f) => f.f <= d.f + 6).pop()?.expr ?? 'neutral', voiceAsset: v ?? null, status: v ? 'LINKED' : 'MISSING_VOICE', lipSyncData: d.mouthCues ?? textMouthCues(d.text), lipSyncSource: d.mouthCues ? 'recorded cues' : 'text-derived (Hangul vowels) — replace with cues from the real recording', subtitleData: { start: d.f, end: d.f + d.dur, text: d.text } }); });
        for (const e of s.soundEffects) { const t = TRACK[e.sound] ?? 'Impact SFX'; (tracks[t] ??= {})[e.sound] = (tracks[t][e.sound] ?? 0) + 1; }
        if (s.musicCue) (tracks.Music ??= {})[s.musicCue.id] = (tracks.Music[s.musicCue.id] ?? 0) + 1;
      }
      writeJsonAtomic(`episode/${EP}/audio/voice_manifest.json`, { note: 'Drop public/voices/<dialogueId>.wav to link a voice. No TTS engine is installed; nothing here is recorded speech.', lines, tracks: { Dialogue: 'public/voices/*', ...tracks, Master: 'mixed in Remotion per cut; trimmed to exact frame length at assembly' } });
      console.log(`voice manifest: ${lines.length} lines, ${(lines as any[]).filter((l) => l.status === 'MISSING_VOICE').length} MISSING_VOICE`); syncState(); break;
    }
    case 'storyboard': { const done = generateStoryboards(opt('scene')?.split(',')); if (!opt('scene')) overviewSheet(); syncState({ storyboardOk: done }); writeCheckpoint({ phase: 'storyboard' }); status(); break; }
    case 'preview': case 'render-shot': case 'render-scene': case 'render-all': case 'resume': {
      const shots = loadShots();
      let ids: string[] | undefined;
      if (cmd === 'render-shot') ids = (opt('shot') ?? rest.find((r) => !r.startsWith('--')))?.split(',');
      if (cmd === 'render-scene') ids = shots.filter((s) => opt('scene')!.split(',').includes(s.sceneId)).map((s) => s.shotId);
      if (cmd === 'preview') { ids = shots.filter((s) => (opt('scene') ? opt('scene')!.split(',').includes(s.sceneId) : true)).map((s) => s.shotId); }
      const fr = opt('frames')?.split('-').map(Number) as [number, number] | undefined;
      await renderShots({ ids, tag: cmd === 'preview' ? '720p' : tag, force: flag('force'), onlyFailed: cmd === 'resume' && flag('failed-only'), limit: opt('limit') ? Number(opt('limit')) : undefined, frames: fr, concurrency: opt('concurrency') ? Number(opt('concurrency')) : undefined, retries: opt('retries') ? Number(opt('retries')) : 2, badge: !flag('clean') });
      status(); break;
    }
    case 'qa': {
      const shots = loadShots(); const st = syncState(); let n = 0;
      for (const [i, s] of shots.entries()) {
        if (opt('scene') && !opt('scene')!.split(',').includes(s.sceneId)) continue;
        const file = cachePath(s, tag); if (!existsSync(file)) continue;
        const q = runQa(s, file, tag, shots[i - 1], shots[i + 1]); st.shots[s.shotId].qualityResults = q; n++;
        console.log(`${q.verdict.padEnd(6)} ${s.shotId}  ${q.checks.filter((c) => c.verdict !== 'PASS').map((c) => `${c.name}:${c.verdict}(${c.info.slice(0, 70)})`).join(' | ')}`);
      }
      saveState(st); syncState(); console.log(`QA run on ${n} rendered cuts @${tag}`); status(); break;
    }
    case 'approve': { // explicit human sign-off per cut (never automatic)
      const ids = (opt('shots') ?? '').split(',').filter(Boolean); const st = syncState();
      for (const id of ids) { const r = st.shots[id]; if (!r?.qualityResults) { console.log(`${id}: no QA result — run qa first`); continue; } if (r.qualityResults.verdict !== 'PASS') { console.log(`${id}: QA is ${r.qualityResults.verdict}, cannot approve`); continue; } r.approved = true; r.qualityResults.visual = 'APPROVED'; console.log(`${id}: approved`); }
      saveState(st); syncState(); break;
    }
    case 'assemble': {
      const r = assemble(tag, { partial: flag('partial') });
      if (!r.ok) { console.log('ASSEMBLE REFUSED:', r.reason); process.exit(2); }
      console.log(`assembled ${r.includedShots} cuts → ${r.out}\n frames ${r.probe.frames} (expected ${r.expectedFrames}) video ${r.probe.vDur}s audio ${r.probe.aDur}s ${r.probe.width}x${r.probe.height}@${r.probe.fps}`);
      if (r.probe.frames !== r.expectedFrames) { console.log('FRAME COUNT MISMATCH'); process.exit(3); }
      writeCheckpoint({ phase: 'assemble', lastAssembled: r.out }); break;
    }
    case 'report': case 'finalize': {
      const { writeReports } = await import('./report');
      await writeReports(cmd === 'finalize'); break;
    }
    default:
      console.log('commands: audit | status | audio | storyboard [--scene S01] | preview [--scene S01] | render-shot <ids> [--720] [--frames a-b] | render-scene --scene S01 | render-all [--720] [--limit N] | resume [--failed-only] | qa [--scene] [--720] | approve --shots a,b | assemble [--partial] [--720] | report | finalize');
  }
}
main().catch((e) => { console.error('ERROR', e); writeCheckpoint({ lastError: String(e?.message ?? e).slice(0, 500) }); process.exit(1); });
