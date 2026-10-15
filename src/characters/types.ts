export interface Palette {
  skin: string; skinShade: string; hair: string; hairShade: string; hairHi: string; eye: string; eyeShade: string;
  outline: string; coat: string; coatShade: string; coatTrim: string; inner: string; innerShade: string;
  pants: string; pantsShade: string; boots: string; bootsShade: string; accent: string; blade: string; bladeGlow: string;
}
export type HairStyle = 'spiky' | 'ponytail' | 'bob' | 'swept';
export type CoatStyle = 'longcoat' | 'cloak' | 'jacket' | 'labcoat' | 'none';
export type AccessoryStyle = 'scarf' | 'collar' | 'ribbon' | 'none';
export type HeadAccStyle = 'none' | 'mask' | 'glasses' | 'headband';
export interface PartOverride {
  /** path under public/ (png/svg/webp) */
  src: string;
  /** placement in the part's local space */
  x: number; y: number; w: number; h: number; rot?: number;
}
export interface CharacterDef {
  id: string; name: string; nameKo: string; role: string;
  /** 'placeholder-vector' = procedural temp art; 'final' = artist-supplied overrides */
  assetStatus: 'placeholder-vector' | 'partial-override' | 'final';
  /** 1.0 = 380px tall */
  height: number;
  palette: Palette;
  hair: HairStyle; coat: CoatStyle; accessory: AccessoryStyle; headAcc: HeadAccStyle;
  skirt: boolean; sleeves: 'coat' | 'inner' | 'bare';
  weapon: 'katana' | 'none';
  /** body widths */
  build: { shoulder: number; limb: number; hips: number };
  eyeStyle: { size: number; tall: number };
  /** replacement art: key = partId or partId@variant */
  overrides: Record<string, PartOverride>;
}
