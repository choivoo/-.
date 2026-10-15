import React from 'react';
import { Composition, staticFile } from 'remotion';
import { setAssetResolver } from './utils/assets';
import { ShotComposition, ShotSequence } from './render/ShotComposition';
import type { ShotSpec } from './scenes/types';
import sampleShots from '../episode/SAMPLE01/shots/shots.json';
import { loadEpisodeShots } from './scenes/episodeData';

setAssetResolver((p) => staticFile(p));
const sample = sampleShots as unknown as ShotSpec[];
const episode = loadEpisodeShots();
const dim = { width: 1920, height: 1080, fps: 24 };
const totalOf = (s: ShotSpec[]) => s.reduce((a, x) => a + x.durationFrames, 0);

export const Root: React.FC = () => (
  <>
    {/* Any single shot: inputProps {shot} supplied by the renderer, so JSON edits need no recompile */}
    <Composition id="Shot" component={ShotComposition as React.FC<any>} {...dim} durationInFrames={24}
      defaultProps={{ shot: sample[0], badge: true }}
      calculateMetadata={({ props }: any) => ({ durationInFrames: props.shot.durationFrames })} />
    <Composition id="Sample30" component={ShotSequence as React.FC<any>} {...dim} durationInFrames={totalOf(sample)} defaultProps={{ shots: sample, badge: true }} />
    <Composition id="Episode" component={ShotSequence as React.FC<any>} {...dim} durationInFrames={Math.max(1, totalOf(episode))} defaultProps={{ shots: episode, badge: true }} />
  </>
);
