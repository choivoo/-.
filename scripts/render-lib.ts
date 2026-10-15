import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export function findBrowser(): string | undefined {
  if (process.env.BROWSER_EXECUTABLE) return process.env.BROWSER_EXECUTABLE;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(root)) return undefined; // let Remotion download/locate its own
  for (const d of readdirSync(root)) if (d.startsWith('chromium_headless_shell')) { const p = path.join(root, d, 'chrome-linux', 'headless_shell'); if (existsSync(p)) return p; }
  for (const d of readdirSync(root)) if (d.startsWith('chromium-')) { const p = path.join(root, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; }
  return undefined;
}
let bundled: string | undefined;
export async function getBundle(): Promise<string> {
  if (!bundled) bundled = await bundle({ entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public') });
  return bundled;
}
export interface RenderOpts { comp: string; props?: Record<string, unknown>; out: string; width: number; height: number; frameRange?: [number, number]; concurrency?: number; onProgress?: (p: number) => void }
export async function renderComp(o: RenderOpts) {
  const serveUrl = await getBundle();
  const browserExecutable = findBrowser();
  const composition = await selectComposition({ serveUrl, id: o.comp, inputProps: o.props ?? {}, browserExecutable });
  await renderMedia({
    composition: { ...composition, width: o.width, height: o.height }, serveUrl, codec: 'h264', outputLocation: o.out, inputProps: o.props ?? {},
    browserExecutable, frameRange: o.frameRange, concurrency: o.concurrency ?? 3, crf: 20, pixelFormat: 'yuv420p', audioCodec: 'aac',
    chromiumOptions: { gl: 'angle', disableWebSecurity: false }, onProgress: (p) => o.onProgress?.(p.progress),
  });
}
