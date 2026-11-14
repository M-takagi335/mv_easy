import { clamp, STEP } from './model.ts';
import type { Edge, Span } from './model.ts';

export type MusicClip = Span & {
  asset: { id: string; name: string; duration: number };
  inPoint: number;
  volume: number;
  muted: boolean;
};

export function sourceTime(clip: MusicClip, time: number) {
  return clamp(clip.inPoint + time - clip.start, 0, clip.asset.duration);
}

export function editMusic(clip: MusicClip, edge: Edge, delta: number): MusicClip {
  const shift = Math.round(delta / STEP) * STEP;
  if (edge === 'move') {
    const start = Math.max(0, clip.start + shift);
    return { ...clip, start, end: start + (clip.end - clip.start) };
  }
  const minimum = Math.min(STEP, clip.asset.duration);
  if (edge === 'start') {
    const start = clamp(clip.start + shift, Math.max(0, clip.start - clip.inPoint), Math.max(clip.start, clip.end - minimum));
    return { ...clip, start, inPoint: clip.inPoint + start - clip.start };
  }
  return { ...clip, end: clamp(clip.end + shift, clip.start + minimum, clip.start + clip.asset.duration - clip.inPoint) };
}

export async function readMusic(file: File) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (!(buffer.duration > 0)) throw new Error('Empty audio');
    const count = Math.min(2400, buffer.length);
    const peaks = new Float32Array(count);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let i = 0; i < count; i++) {
        const begin = Math.floor(i * samples.length / count);
        const end = Math.floor((i + 1) * samples.length / count);
        let peak = peaks[i];
        for (let j = begin; j < end; j++) peak = Math.max(peak, Math.abs(samples[j]));
        peaks[i] = Math.min(1, peak);
        if (i % 256 === 255) await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    return { duration: buffer.duration, peaks };
  } finally {
    await context.close();
  }
}
