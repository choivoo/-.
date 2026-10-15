import { existsSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { OUT, EP, loadShots, loadMeta, cachePath, writeJsonAtomic, engineHash, STAGES } from './common';
import { loadState, summary, syncState, writeCheckpoint } from './state';
import { probe, blackSegments } from './qa';
import { CHARACTERS } from '../../src/characters/defs';
import { BACKGROUNDS } from '../../src/scenes/backgrounds';

function sceneSheets(): string[] {
  const dir = `${OUT}/${EP}_CONTACT_SHEETS`; mkdirSync(dir, { recursive: true });
  const shots = loadShots(), meta = loadMeta(), made: string[] = [];
  for (const sc of meta.scenes) {
    const pngs = shots.filter((s) => s.sceneId === sc.sceneId).map((s) => `${OUT}/contact/${s.shotId}_1080p.png`).filter(existsSync);
    const fallback = pngs.length ? pngs : shots.filter((s) => s.sceneId === sc.sceneId).map((s) => `${OUT}/contact/${s.shotId}_720p.png`).filter(existsSync);
    if (!fallback.length) continue;
    const out = `${dir}/${sc.sceneId}_qa_contact.png`;
    try {
      const args = ['-y', '-v', 'error']; fallback.forEach((p) => args.push('-i', p));
      args.push('-filter_complex', fallback.map((_, i) => `[${i}]scale=1280:-1[v${i}]`).join(';') + ';' + fallback.map((_, i) => `[v${i}]`).join('') + `vstack=inputs=${fallback.length}`, out);
      execFileSync('ffmpeg', args); made.push(out);
    } catch { /* skip */ }
  }
  const sb = `episode/${EP}/storyboard/sheets`;
  if (existsSync(sb)) for (const f of readdirSync(sb)) if (f.endsWith('.png')) { copyFileSync(`${sb}/${f}`, `${dir}/storyboard_${f}`); made.push(`${dir}/storyboard_${f}`); }
  return made;
}

export async function writeReports(finalize: boolean) {
  const st = syncState(); const s = summary(st); const shots = loadShots(); const meta = loadMeta();
  const recs = Object.values(st.shots);
  const sheets = sceneSheets();
  // assembled file checks
  const names = existsSync(OUT) ? readdirSync(OUT).filter((f) => /^EP01_.*\.mp4$/.test(f)) : [];
  const full1080 = names.find((f) => /1080P\.mp4$/.test(f) && !/PARTIAL/.test(f));
  let assembled: Record<string, unknown> | null = null; const problems: string[] = [];
  if (full1080) {
    const file = `${OUT}/${full1080}`; const p = probe(file);
    const blacks = blackSegments(file).filter((b) => b.dur > 1.5);
    assembled = { file, ...p, expectedFrames: 28800, blackSegments: blacks };
    if (p.frames !== 28800) problems.push(`frames ${p.frames} != 28800`);
    if (p.width !== 1920 || p.height !== 1080) problems.push('resolution');
    if (Math.abs(p.fps - 24) > 0.01) problems.push('fps');
    if (p.aDur === null || Math.abs(p.aDur - 1200) > 0.1) problems.push(`audio duration ${p.aDur} vs 1200`);
    if (Math.abs(p.vDur - 1200) > 0.05) problems.push(`video duration ${p.vDur}`);
    if (blacks.length) problems.push(`black segments: ${blacks.map((b) => `${b.start}s`).join(',')}`);
  }
  // FINAL requires every cut approved + PASS + no missing voice + a verified full assembly
  const notFinal: string[] = [];
  if (!full1080) notFinal.push('no full 1080p assembly exists');
  if (problems.length) notFinal.push(...problems);
  const nonFinalCuts = recs.filter((r) => r.productionStatus !== 'FINAL');
  if (nonFinalCuts.length) notFinal.push(`${nonFinalCuts.length}/${recs.length} cuts are not FINAL (stage counts: ${JSON.stringify(s.byStage)})`);
  if (s.missingVoiceLines) notFinal.push(`${s.missingVoiceLines} dialogue lines have MISSING_VOICE`);
  if (s.animatic) notFinal.push(`${s.animatic} cuts are environment-only animatic shots (camera + VFX, no acting)`);
  notFinal.push('all character/background art is procedural placeholder vector art (CHARACTER FORGE 2.0 assets not present)');
  notFinal.push('music is a synthesised placeholder drone; OP/ED music slots unfilled');
  const isFinal = notFinal.length === 0;

  // PREVIEW 720p derived from the 1080p assembly when present
  let preview: string | null = null;
  if (full1080) { const p720 = `${OUT}/EP01_PREVIEW_720P.mp4`; if (!existsSync(p720) || statSync(p720).mtimeMs < statSync(`${OUT}/${full1080}`).mtimeMs) execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', `${OUT}/${full1080}`, '-vf', 'scale=1280:720', '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', p720]); preview = p720; }
  let finalPath: string | null = null;
  if (full1080) { finalPath = `${OUT}/${isFinal && finalize ? 'EP01_FINAL_1080P.mp4' : full1080}`; if (isFinal && finalize && finalPath !== `${OUT}/${full1080}`) copyFileSync(`${OUT}/${full1080}`, finalPath); }

  const manifest = { episode: EP, generated: new Date().toISOString(), engineHash: engineHash(), status: isFinal && finalize ? 'FINAL' : 'WORK_IN_PROGRESS', whyNotFinal: isFinal ? [] : notFinal, assembled, preview, sheets,
    cuts: shots.map((sh) => ({ shotId: sh.shotId, startFrame: sh.startFrame, durationFrames: sh.durationFrames, file: existsSync(cachePath(sh, '1080p')) ? cachePath(sh, '1080p') : null, file720: existsSync(cachePath(sh, '720p')) ? cachePath(sh, '720p') : null, hash: st.shots[sh.shotId]?.contentHash })) };
  writeJsonAtomic(`${OUT}/EP01_RENDER_MANIFEST.json`, manifest);
  writeJsonAtomic(`${OUT}/EP01_PRODUCTION_STATUS.json`, { summary: s, shots: st.shots, log: st.log.slice(-50) });

  const fid = (k: string) => recs.filter((r) => r.fidelity === k).reduce((a, r) => a + r.durationFrames, 0);
  let qa = `# EP01 QA REPORT\n\nGenerated ${new Date().toISOString()} — status **${manifest.status}**\n\n## Verdict\n${isFinal && finalize ? 'All conditions met.' : '**Not FINAL.** Reasons:\n' + notFinal.map((n) => `- ${n}`).join('\n')}\n\n## Totals\n- cuts ${s.shots}, frames ${s.frames} (${s.frames / 24}s)\n- QA: PASS ${s.qa.PASS} · REVIEW ${s.qa.REVIEW} · FAIL ${s.qa.FAIL} · not run ${s.qa.none}\n- render 1080p: ${JSON.stringify(s.render1080)}\n- human-approved cuts: ${s.approved}\n- fidelity frames: animatic ${fid('animatic')} · directed ${fid('directed')} · final-draft ${fid('final-draft')}\n`;
  if (assembled) qa += `\n## Assembled video\n\`\`\`json\n${JSON.stringify(assembled, null, 1)}\n\`\`\`\nProblems: ${problems.length ? problems.join('; ') : 'none'}\n`;
  qa += `\n## Per-cut results\n| cut | stage | QA | non-pass checks |\n|---|---|---|---|\n`;
  for (const r of recs) qa += `| ${r.shotId} | ${r.productionStatus}${r.blocked.length ? ' ⛔ ' + r.blocked.join(',') : ''} | ${r.qualityResults?.verdict ?? '—'} | ${(r.qualityResults?.checks ?? []).filter((c) => c.verdict !== 'PASS').map((c) => `${c.name}: ${c.info.slice(0, 60)}`).join('; ')} |\n`;
  writeFileSync(`${OUT}/EP01_QA_REPORT.md`, qa);

  let ar = `# EP01 ASSET REPORT\n\n## Characters\n| id | assetStatus | part overrides | fingerprint |\n|---|---|---|---|\n`;
  for (const c of Object.values(CHARACTERS)) ar += `| ${c.id} | ${c.assetStatus} | ${Object.keys(c.overrides).length} | ${JSON.stringify(c.palette).length} |\n`;
  ar += `\n## Backgrounds\n${Object.values(BACKGROUNDS).map((b) => `- ${b.id}: ${b.layers.length} parallax layers, ${b.assetStatus}`).join('\n')}\n\n## Audio\n- SFX/music: synthesised placeholders (public/sounds/PLACEHOLDER.md)\n- Voice: ${s.missingVoiceLines} lines MISSING_VOICE; drop \`public/voices/<dialogueId>.wav\` to link (ids in episode/EP01/audio/voice_manifest.json)\n`;
  writeFileSync(`${OUT}/EP01_ASSET_REPORT.md`, ar);

  const pr = `# PRODUCTION REPORT (${EP})\n\n- generated ${new Date().toISOString()}\n- status: **${manifest.status}**\n- assembled: ${assembled ? JSON.stringify({ file: (assembled as any).file, frames: (assembled as any).frames, vDur: (assembled as any).vDur, aDur: (assembled as any).aDur }) : 'none'}\n- stages: ${JSON.stringify(s.byStage)}\n- why not final:\n${notFinal.map((n) => `  - ${n}`).join('\n') || '  - (none)'}\n`;
  writeFileSync('PRODUCTION_REPORT.md', pr);
  writeCheckpoint({ phase: finalize ? 'finalize' : 'report', status: manifest.status, finalPath, preview });
  console.log(`report written → ${OUT}/ (status ${manifest.status})`);
  for (const n of notFinal) console.log(' - ' + n);
  if (finalPath) console.log('video:', finalPath);
}
