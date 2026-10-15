import type { CadenceKey } from '../engine/FrameScheduler';
import type { TimeRemapKey } from '../engine/FrameScheduler';
import type { ClipCue } from '../animation/ActionAnimator';
import type { FaceCue, MouthCue } from '../animation/Face';
import type { CameraKey, ShakeEvent, ImpactZoom } from '../camera/CameraDirector';
import type { VfxEvent } from '../effects/VFXComposer';
import type { EaseName } from '../utils/math';

export interface PathKey { f: number; x: number; y?: number; flip?: boolean; ease?: EaseName }
export interface AfterImage { from: number; to: number; count: number; gap: number; opacity: number; color?: 'cyan' | 'red' | 'white' }
export interface SwordTrail { from: number; to: number; frames?: number; color?: string }
export interface CharacterTrack {
  id: string;
  x: number; y?: number; flip?: boolean; scale?: number; visible?: boolean;
  path?: PathKey[];
  animationClips: ClipCue[];
  face?: FaceCue[];
  /** drawing cadence per segment; default twos */
  cadence?: CadenceKey[];
  afterimage?: AfterImage[];
  swordTrail?: SwordTrail[];
}
export interface DialogueLine { f: number; dur: number; speaker: string; text: string; voiceAsset?: string | null; mouthCues?: MouthCue[]; placeholderVoice?: boolean }
export interface SfxCue { f: number; sound: string; volume?: number }
export interface MusicCue { id: string; /** frame offset inside the music track where this shot starts */ trackOffset: number; volume?: number; fadeInFrames?: number; fadeOutFrames?: number }
export interface Transition { inType?: 'cut' | 'fadeBlack' | 'fadeWhite'; inFrames?: number; outType?: 'cut' | 'fadeBlack' | 'fadeWhite'; outFrames?: number }
export type RenderStatus = 'pending' | 'rendered' | 'failed';
/** animatic = engine-staged placeholder cut; final-draft = fully choreographed cut (still placeholder vector art) */
export type Fidelity = 'animatic' | 'directed' | 'final-draft' | 'title';
export interface ShotSpec {
  sceneId: string; shotId: string;
  startFrame: number; durationFrames: number;
  backgroundId: string;
  characterIds: string[];
  characters: CharacterTrack[];
  cameraKeyframes: CameraKey[];
  cameraShake?: ShakeEvent[];
  impactZooms?: ImpactZoom[];
  cameraFollow?: { char: string; weight: number; dx?: number; dy?: number; from?: number; to?: number };
  cameraCadence?: 'ones' | 'twos';
  timeRemap?: TimeRemapKey[];
  vfx?: VfxEvent[];
  dialogue: DialogueLine[];
  voiceAsset?: string | null;
  soundEffects: SfxCue[];
  musicCue?: MusicCue | null;
  transition?: Transition;
  renderStatus: RenderStatus;
  fidelity: Fidelity;
  title?: string;
  notes?: string;
  /** production metadata */
  kind?: string; purpose?: string; priority?: 'P0' | 'P1' | 'P2' | 'P3'; description?: string; shotSize?: string; hitEvents?: { f: number; kind: string; x: number; y: number; contact: boolean; strength: number; attacker: string; defender: string }[];
}
export interface SceneMeta { sceneId: string; title: string; startFrame: number; durationFrames: number; summary: string; beat: string }
export interface EpisodeMeta { id: string; title: string; titleKo: string; fps: number; width: number; height: number; totalFrames: number; scenes: SceneMeta[]; shotFiles: string[] }
