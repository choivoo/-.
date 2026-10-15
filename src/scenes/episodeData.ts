import type { ShotSpec, EpisodeMeta } from './types';

/** Bundler-friendly loaders (Vite + Remotion webpack both support import.meta.glob-free static imports via require.context fallback). */
import ep01Shots from '../../episode/EP01/shots/all.json';
import ep01Meta from '../../episode/EP01/metadata/episode.json';
import sampleShots from '../../episode/SAMPLE01/shots/shots.json';
import sampleMeta from '../../episode/SAMPLE01/metadata/episode.json';

export const loadEpisodeShots = (): ShotSpec[] => ep01Shots as unknown as ShotSpec[];
export const loadEpisodeMeta = (): EpisodeMeta => ep01Meta as unknown as EpisodeMeta;
export const loadSampleShots = (): ShotSpec[] => sampleShots as unknown as ShotSpec[];
export const loadSampleMeta = (): EpisodeMeta => sampleMeta as unknown as EpisodeMeta;
