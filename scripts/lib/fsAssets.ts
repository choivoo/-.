import { existsSync, readdirSync } from 'node:fs';
import { CHARACTERS } from '../../src/characters/defs';
import type { Issue } from '../../src/scenes/validate';
export const soundExists = (name: string) => ['wav', 'mp3', 'ogg'].some((e) => existsSync(`public/sounds/${name}.${e}`));
export function validateCharacterAssetPaths(): Issue[] {
  const out: Issue[] = [];
  for (const c of Object.values(CHARACTERS)) for (const [part, ov] of Object.entries(c.overrides)) if (!existsSync(`public/${ov.src}`)) out.push({ level: 'error', msg: `${c.id}.${part}: override asset missing public/${ov.src}` });
  return out;
}
export const listDir = (d: string) => (existsSync(d) ? readdirSync(d) : []);
export const publicFileExists = (p: string) => existsSync(`public/${p}`);
