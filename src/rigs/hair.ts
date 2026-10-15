import type { HairStyle } from '../characters/types';

/** Hair silhouettes in face coordinates (origin = face centre, facing +x). `s` = wind/sway 0..1.5 */
export interface HairPaths { back: string; side: string; front: string; hi: string[]; ponytail?: string }
const f = (n: number) => n.toFixed(1);

export function hairPaths(style: HairStyle, s: number, variant: number): HairPaths {
  const w = s + variant * 0.5;
  switch (style) {
    case 'spiky':
      return {
        back: `M -34,-28 C -42,-62 -14,-74 8,-70 C 32,-66 44,-46 38,-22 L 30,-8 L -22,-2 L ${f(-48 - w * 16)},${f(8 + w * 4)} L -30,-12 L ${f(-58 - w * 20)},${f(-14 + w * 6)} L -38,-24 Z`,
        side: `M -33,-26 L -38,6 L -30,-6 L -28,10 L -24,-16 Z`,
        front: `M -38,-26 C -40,-62 -12,-76 12,-72 C 34,-66 44,-48 40,-26 L 36,-14 L 31,-30 L 26,-6 L 17,-32 L 9,-8 L 2,-34 L -7,-12 L -13,-38 L -22,-14 L -30,-36 L -37,-16 Z`,
        hi: ['M -8,-62 C 4,-68 16,-64 22,-56', 'M -22,-56 C -18,-62 -14,-64 -8,-66'],
      };
    case 'ponytail':
      return {
        back: `M -34,-30 C -44,-62 -12,-76 10,-70 C 32,-64 42,-46 38,-24 L 30,-8 L -24,-8 Z`,
        side: `M -33,-26 L -36,16 L -28,6 L -26,26 L -22,-12 Z`,
        front: `M -38,-28 C -40,-64 -10,-78 14,-72 C 36,-66 46,-46 42,-22 L 34,-34 L 30,-12 L 22,-36 L 14,-10 L 6,-36 L -4,-14 L -14,-40 L -24,-18 L -34,-40 Z`,
        ponytail: `M -36,-46 C ${f(-62 - w * 22)},-44 ${f(-84 - w * 30)},${f(-10 + w * 14)} ${f(-92 - w * 46)},${f(52 + w * 16)} C ${f(-70 - w * 30)},${f(30 + w * 8)} ${f(-58 - w * 18)},4 -44,-28 Z`,
        hi: ['M -4,-66 C 10,-70 24,-64 30,-52', 'M -26,-54 C -20,-62 -14,-66 -8,-68'],
      };
    case 'bob':
      return {
        back: `M -36,-26 C -48,-60 -12,-76 10,-72 C 34,-66 46,-46 40,-20 C 38,6 34,22 22,28 L -24,30 C -40,26 -48,0 -36,-26 Z`,
        side: `M -33,-26 C -44,-4 -42,22 -30,30 L -20,26 L -24,-8 Z`,
        front: `M -38,-28 C -40,-64 -10,-78 14,-72 C 38,-66 48,-46 42,-22 L 36,-22 C 34,-34 30,-38 24,-40 C 16,-34 6,-36 0,-42 C -8,-34 -18,-36 -24,-40 L -32,-34 L -38,-20 Z`,
        hi: ['M -10,-66 C 4,-72 18,-68 26,-58'],
      };
    case 'swept':
    default:
      return {
        back: `M -34,-28 C -42,-60 -12,-72 8,-68 C 30,-64 42,-46 38,-22 L 30,-8 L -26,-8 Z`,
        side: `M -33,-26 L -34,2 L -26,-6 Z`,
        front: `M -38,-28 C -42,-64 -6,-78 18,-70 C 40,-62 46,-44 42,-30 C 30,-46 14,-50 -4,-46 C -18,-42 -30,-36 -38,-28 Z`,
        hi: ['M -14,-64 C 2,-70 20,-66 30,-54'],
      };
  }
}
