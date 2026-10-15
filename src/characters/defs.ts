import type { CharacterDef } from './types';

const base = { overrides: {}, assetStatus: 'placeholder-vector' as const };

export const SOMA: CharacterDef = {
  ...base, id: 'soma', name: 'Soma Kiritani', nameKo: '키리타니 소마', role: 'protagonist', height: 1,
  palette: {
    skin: '#f7dcc8', skinShade: '#e3b9a4', hair: '#1f2a4d', hairShade: '#121a33', hairHi: '#7f9be8', eye: '#27d3c0', eyeShade: '#0d6f78',
    outline: '#120d1c', coat: '#232a44', coatShade: '#141a2e', coatTrim: '#2ee6d0', inner: '#e8eef6', innerShade: '#b6c2d4',
    pants: '#2b3047', pantsShade: '#1a1d2e', boots: '#17181f', bootsShade: '#0c0d12', accent: '#2ee6d0', blade: '#dfe9f5', bladeGlow: '#6ff5e6',
  },
  hair: 'spiky', coat: 'longcoat', accessory: 'scarf', headAcc: 'none', skirt: false, sleeves: 'coat', weapon: 'katana',
  build: { shoulder: 1, limb: 1, hips: 1 }, eyeStyle: { size: 1, tall: 1 },
};

export const VEYRA: CharacterDef = {
  ...base, id: 'veyra', name: 'Veyra', nameKo: '베이라', role: 'rival swordsman', height: 1.1,
  palette: {
    skin: '#f1d9d0', skinShade: '#d6b0aa', hair: '#e8ecf6', hairShade: '#a7b1ca', hairHi: '#ffffff', eye: '#ff2f4f', eyeShade: '#8a0f26',
    outline: '#140a14', coat: '#2b1019', coatShade: '#18070e', coatTrim: '#d4213f', inner: '#17171f', innerShade: '#0d0d12',
    pants: '#1c1c26', pantsShade: '#101016', boots: '#101015', bootsShade: '#08080b', accent: '#ff2f4f', blade: '#e6d9dd', bladeGlow: '#ff4466',
  },
  hair: 'ponytail', coat: 'cloak', accessory: 'collar', headAcc: 'mask', skirt: false, sleeves: 'coat', weapon: 'katana',
  build: { shoulder: 1.05, limb: 0.92, hips: 0.95 }, eyeStyle: { size: 1.05, tall: 0.85 },
};

export const MIO: CharacterDef = {
  ...base, id: 'mio', name: 'Mio Hoshikawa', nameKo: '호시카와 미오', role: 'childhood friend', height: 0.9,
  palette: {
    skin: '#fadfcd', skinShade: '#e8bba8', hair: '#7b4a3c', hairShade: '#4f2c24', hairHi: '#d99a7e', eye: '#f2a93b', eyeShade: '#a8631a',
    outline: '#2a141c', coat: '#ece3d2', coatShade: '#cbbfa8', coatTrim: '#e98aa0', inner: '#f4a9b8', innerShade: '#d1788d',
    pants: '#3a3a52', pantsShade: '#26263a', boots: '#6b4a3c', bootsShade: '#47301f', accent: '#e98aa0', blade: '#ccc', bladeGlow: '#fff',
  },
  hair: 'bob', coat: 'jacket', accessory: 'ribbon', headAcc: 'none', skirt: true, sleeves: 'coat', weapon: 'none',
  build: { shoulder: 0.85, limb: 0.85, hips: 0.95 }, eyeStyle: { size: 1.15, tall: 1.05 },
};

export const KAEDE: CharacterDef = {
  ...base, id: 'kaede', name: 'Dr. Kuon Kaede', nameKo: '카에데 쿠온 박사', role: 'former researcher', height: 1.0,
  palette: {
    skin: '#f0d3bd', skinShade: '#d8b098', hair: '#c9ced8', hairShade: '#8f97a8', hairHi: '#f2f4f8', eye: '#6aa7d8', eyeShade: '#2a5a86',
    outline: '#1a1620', coat: '#f1f3f6', coatShade: '#c3c9d4', coatTrim: '#6aa7d8', inner: '#3b4a63', innerShade: '#26324a',
    pants: '#3d3f4d', pantsShade: '#272833', boots: '#2a2020', bootsShade: '#161010', accent: '#6aa7d8', blade: '#ccc', bladeGlow: '#fff',
  },
  hair: 'swept', coat: 'labcoat', accessory: 'none', headAcc: 'glasses', skirt: false, sleeves: 'coat', weapon: 'none',
  build: { shoulder: 0.95, limb: 0.95, hips: 1 }, eyeStyle: { size: 0.9, tall: 0.9 },
};

export const CHARACTERS: Record<string, CharacterDef> = { soma: SOMA, veyra: VEYRA, mio: MIO, kaede: KAEDE };
export const characterList = () => Object.values(CHARACTERS);
