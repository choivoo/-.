/** Asset URL resolver. Remotion sets staticFile(); the browser editor serves /public at '/'. */
let resolver: (p: string) => string = (p) => '/' + p.replace(/^\/+/, '');
export const setAssetResolver = (fn: (p: string) => string) => { resolver = fn; };
export const assetUrl = (p: string) => resolver(p);
