import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { ShotView } from '../scenes/ShotView';
import type { ShotSpec } from '../scenes/types';

const MUSIC_LEN_FRAMES: Record<string, number> = { tension_drone: 60 * 24 };

export const ShotComposition: React.FC<{ shot: ShotSpec; badge?: boolean }> = ({ shot, badge }) => {
  const frame = useCurrentFrame();
  const m = shot.musicCue;
  const mlen = m ? MUSIC_LEN_FRAMES[m.id] ?? 1440 : 1440;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <ShotView shot={shot} frame={frame} opts={{ badge: badge ?? true }} />
      {m && (
        <Audio
          src={staticFile(`sounds/${m.id}.wav`)}
          startFrom={m.trackOffset % mlen}
          volume={(f) => (m.volume ?? 0.5) * interpolate(f, [0, m.fadeInFrames ?? 1, shot.durationFrames - (m.fadeOutFrames ?? 1), shot.durationFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      )}
      {shot.soundEffects.map((s, i) => (
        <Sequence key={`${s.sound}-${s.f}-${i}`} from={s.f} layout="none">
          <Audio src={staticFile(`sounds/${s.sound}.wav`)} volume={s.volume ?? 1} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const ShotSequence: React.FC<{ shots: ShotSpec[]; badge?: boolean }> = ({ shots, badge }) => (
  <AbsoluteFill>
    {shots.map((s) => (
      <Sequence key={s.shotId} from={s.startFrame} durationInFrames={s.durationFrames} name={s.shotId}>
        <ShotComposition shot={s} badge={badge} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
