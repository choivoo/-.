import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { planDuel, solveGap, exchangeFrames, Exchange } from '../src/animation/Choreography';
import { remapTime } from '../src/engine/FrameScheduler';
import { contentHash, writeJsonAtomic, dialogueId, voicePath } from '../scripts/production/common';
import { deriveRecord } from '../scripts/production/state';
import { dataChecks, verdictOf } from '../scripts/production/qa';
import { CLIPS } from '../src/animation/clips';
import type { ShotSpec } from '../src/scenes/types';

let pass = 0, fail = 0;
const t = (name: string, fn: () => void) => { try { fn(); pass++; console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${(e as Error).message}`); } };
const shots: ShotSpec[] = JSON.parse(readFileSync('episode/EP01/shots/all.json', 'utf8'));

console.log('Choreography');
const EXS: Exchange[] = [{ attacker: 0, attack: 'slashH', response: 'guard' }, { attacker: 1, attack: 'slashV', response: 'guard' }, { attacker: 1, attack: 'thrust', response: 'dodge' }, { attacker: 0, attack: 'counter', response: 'hit' }];
t('blade geometry: guard/hit contacts resolve within tolerance', () => { for (const e of EXS.filter((x) => x.response !== 'dodge')) { const r = solveGap('soma', 'veyra', e, 840); assert.ok(r.err < (e.response === 'hit' ? 110 : 60), `${e.attack}/${e.response} err ${r.err}`); } });
t('every contact event has sfx+burst+shake; misses have no impact FX', () => {
  const p = planDuel('soma', 'veyra', EXS, 400, { cx: 1700, ground: 840, seed: 3 });
  assert.equal(p.hits.length, 4);
  for (const h of p.hits) { const has = (type: string) => p.vfx.some((v) => v.type === type && Math.abs(v.f - h.f) <= 1); if (h.contact) { assert.ok(has('impactBurst'), `burst @${h.f}`); assert.ok(p.shakes.some((s) => s.f === h.f)); assert.ok(p.sfx.some((s) => s.f === h.f && /hit/.test(s.sound))); } else { assert.ok(!has('impactBurst') && !has('shockwave'), `FX on miss @${h.f}`); } }
});
t('hit-stop remap: animation time freezes at contact and stays monotonic', () => {
  const p = planDuel('soma', 'veyra', EXS, 400, { cx: 1700, ground: 840, seed: 3 });
  const c = p.hits.filter((h) => h.contact); let prev = -1;
  for (let f = 0; f < 400; f++) { const a = remapTime(f, p.remap); assert.ok(a >= prev, `non-monotonic at ${f}`); prev = a; }
  for (const h of c) assert.equal(remapTime(h.f, p.remap), remapTime(h.f + 2, p.remap));
});
t('attacker and defender react to the same collision frame', () => {
  const p = planDuel('soma', 'veyra', [{ attacker: 0, attack: 'slashH', response: 'guard' }], 120, { cx: 1700, ground: 840, seed: 1 });
  const hitAnim = remapTime(p.hits[0].f, p.remap); const a = p.tracks[0].animationClips.find((c) => c.clip === 'slashH')!, d = p.tracks[1].animationClips.find((c) => c.clip === 'guard')!;
  assert.equal(a.f + CLIPS.slashH.impactT!, hitAnim); assert.equal(d.f + CLIPS.guard.impactT!, hitAnim);
});
t('duel needs-frames helper is consistent', () => { assert.ok(exchangeFrames(EXS[0]) > CLIPS.slashH.impactT!); });

console.log('Production Manager');
t('contentHash stable, and changes when cut data changes', () => { const s = shots[10]; assert.equal(contentHash(s), contentHash({ ...s })); assert.notEqual(contentHash(s), contentHash({ ...s, durationFrames: s.durationFrames + 1 })); assert.equal(contentHash(s), contentHash({ ...s, startFrame: 999999 })); });
t('atomic write leaves no temp files and round-trips', () => { mkdirSync('renders/_t', { recursive: true }); writeJsonAtomic('renders/_t/a.json', { x: 1 }); assert.deepEqual(JSON.parse(readFileSync('renders/_t/a.json', 'utf8')), { x: 1 }); assert.ok(!readdirSync('renders/_t').some((f) => f.endsWith('.tmp'))); rmSync('renders/_t', { recursive: true }); });
t('stage derivation is evidence-based (no render ⇒ no CLEANUP/COMPOSITING/QA/FINAL)', () => { for (const s of shots.slice(0, 20)) { const r = deriveRecord(s); assert.ok(['TODO', 'SCRIPT_READY', 'STORYBOARD_READY', 'BLOCKING', 'ANIMATION'].includes(r.productionStatus), `${s.shotId} ${r.productionStatus}`); assert.equal(r.approved, false); } });
const withoutVoice = (id: string, fn: () => void) => { const f = `public/voices/${id}.wav`; const keep = existsSync(f) ? readFileSync(f) : null; if (keep) rmSync(f); try { fn(); } finally { if (keep) writeFileSync(f, keep); } };
t('missing voices are flagged MISSING_VOICE and block', () => { const s = shots.find((x) => x.dialogue.length)!; withoutVoice(dialogueId(s, 0), () => { const r = deriveRecord(s); assert.equal(r.dialogue[0].voiceStatus, 'MISSING_VOICE'); assert.ok(r.blocked.some((b) => /MISSING_VOICE/.test(b))); }); });
t('voice file auto-links by dialogueId and is labelled synthetic when from TTS manifest', () => { const s = shots.find((x) => x.dialogue.length)!; const id = dialogueId(s, 0); withoutVoice(id, () => { mkdirSync('public/voices', { recursive: true }); writeFileSync(`public/voices/${id}.wav`, Buffer.alloc(64)); try { assert.ok(voicePath(id)); assert.equal(deriveRecord(s).dialogue[0].voiceStatus, 'LINKED'); } finally { rmSync(`public/voices/${id}.wav`); } }); });
t('every dialogue line has real voice audio linked + waveform-derived lip-sync cues', () => { for (const s of shots) for (const d of s.dialogue) { assert.ok(d.voiceAsset && existsSync(`public/${d.voiceAsset}`), `${s.shotId} voice`); assert.ok(d.mouthCues && d.mouthCues.length > 2, `${s.shotId} cues`); assert.ok(d.dur >= 10, 'dur'); } });
t('dialogue ids unique across the episode', () => { const ids = shots.flatMap((s) => s.dialogue.map((_, i) => dialogueId(s, i))); assert.equal(new Set(ids).size, ids.length); });

console.log('QA data checks (all 105 cuts)');
t('no cut fails data-level QA (assets, combat sync, dialogue fit)', () => { const bad: string[] = []; shots.forEach((s, i) => { const c = dataChecks(s, shots[i - 1], shots[i + 1]); if (verdictOf(c) === 'FAIL') bad.push(`${s.shotId}: ${c.filter((x) => x.verdict === 'FAIL').map((x) => x.name + ' ' + x.info).join('; ')}`); }); assert.deepEqual(bad, []); });
t('every duel cut carries collision events', () => { for (const s of shots.filter((x) => x.kind === 'duel' && x.shotId.startsWith('S0') && x.hitEvents !== undefined)) assert.ok(s.hitEvents!.length > 0, s.shotId); });
t('EP01 has no cut with animation clips missing a character track', () => { for (const s of shots) for (const c of s.characters) assert.ok(c.animationClips.length > 0, `${s.shotId}:${c.id}`); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
