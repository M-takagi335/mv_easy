/// <reference types="vite/client" />
import { renderToStaticMarkup } from 'react-dom/server';
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeAudio, canEncodeVideo } from 'mediabunny';
import { Scene } from './Scene';
import { CANVAS, groupLayers } from './model';
import type { Layer } from './model';
import type { FontProvider } from './fonts';
import type { MusicClip } from './music';
import type { MusicAsset } from './project';
import type { Settings } from './projectFile';
import stylesheet from './style.css?inline';

const sampleRate = 48_000;
const audioEncoding = { codec: 'aac' as const, bitrate: 192_000 };
const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));

async function encodeAudio(file: Blob, clips: MusicClip[], duration: number, audio: AudioBufferSource,
  signal: AbortSignal, progress: (fraction: number, message: string) => void) {
  const decoder = new OfflineAudioContext(2, 1, sampleRate);
  const source = await decoder.decodeAudioData(await file.arrayBuffer()).catch(() => {
    throw new Error('音楽をデコードできませんでした。元の音楽を再リンクしてください。');
  });
  signal.throwIfAborted();
  const ordered = [...clips].sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  const spans = ordered.flatMap(clip => {
    const start = Math.max(previousEnd, clip.start);
    previousEnd = Math.max(previousEnd, clip.end);
    if (clip.muted || clip.volume === 0) return [];
    const offset = clip.inPoint + start - clip.start;
    const length = Math.min(duration - start, clip.end - start, source.duration - offset);
    return length <= 0 ? [] : [{ start, end: start + length, offset, volume: clip.volume }];
  });
  const total = Math.max(1, Math.ceil(Math.min(previousEnd, duration) * sampleRate));
  for (let frame = 0; frame < total; frame += 4 * sampleRate) {
    signal.throwIfAborted();
    const length = Math.min(4 * sampleRate, total - frame);
    const start = frame / sampleRate;
    const end = (frame + length) / sampleRate;
    const mixer = new OfflineAudioContext(2, length, sampleRate);
    for (const span of spans) {
      const begin = Math.max(start, span.start);
      const finish = Math.min(end, span.end);
      if (finish <= begin) continue;
      const node = mixer.createBufferSource();
      node.buffer = source;
      const gain = mixer.createGain();
      gain.gain.value = span.volume;
      node.connect(gain).connect(mixer.destination);
      node.start(begin - start, span.offset + begin - span.start, finish - begin);
    }
    const buffer = await mixer.startRendering();
    signal.throwIfAborted();
    await audio.add(buffer);
    progress(0.1 * (frame + length) / total, '音楽をエンコードしています…');
    await yieldToBrowser();
  }
  audio.close();
}

// Use the same scene markup as the interactive preview. Resolve canvas-relative units
// explicitly because the isolated SVG image has no editor viewport.
const sceneRules = stylesheet.replace(/<\/style/gi, '<\\/style');
async function paintFrame(context: CanvasRenderingContext2D, html: string, settings: Settings, signal: AbortSignal) {
  const scaledHtml = html.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '\ufffd')
    .replace(/style="[^"]*"/g, attribute =>
      attribute.replace(/(-?[\d.]+(?:e[+-]?\d+)?)cqw\b/gi, (_, n) => `${Number(n) * CANVAS.width / 100}px`));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${context.canvas.width}" height="${context.canvas.height}"
    viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
    <foreignObject width="${CANVAS.width}" height="${CANVAS.height}">
      <div xmlns="http://www.w3.org/1999/xhtml">
        <style><![CDATA[${sceneRules}
          .canvas { width:1920px; height:1080px; box-shadow:none; background:${settings.background} }
        ]]></style>
        <div class="canvas">${scaledHtml}</div>
      </div>
    </foreignObject>
  </svg>`;
  const image = new Image();
  // Chrome taints canvases when a foreignObject SVG is loaded through a Blob URL.
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new TextDecoder().decode(new TextEncoder().encode(svg)));
  await image.decode();
  signal.throwIfAborted();
  context.drawImage(image, 0, 0, context.canvas.width, context.canvas.height);
}

export async function exportVideo({ layers, clips, asset, duration, settings, fontProvider, signal, progress }: {
  layers: Layer[]; clips: MusicClip[]; asset?: MusicAsset; duration: number; settings: Settings;
  fontProvider: FontProvider; signal: AbortSignal; progress: (fraction: number, message: string) => void;
}) {
  const height = settings.resolution;
  const width = height * 16 / 9;
  const bitrate = Math.round(8_000_000 * (width * height / (1920 * 1080)) *
    (settings.fps / 30) ** 0.5 * (settings.quality === 'high' ? 1.8 : 1));
  const hasAudio = clips.length > 0;
  if (hasAudio && !asset) throw new Error('音楽が見つかりません。タイムラインで再リンクしてから書き出してください。');
  if (duration * (bitrate + (hasAudio ? audioEncoding.bitrate : 0)) / 8 > 512 * 1024 * 1024) {
    throw new Error('推定ファイルサイズが512 MBを超えます。解像度・FPS・画質を下げてください。');
  }
  const videoConfig = { width, height, bitrate, frameRate: settings.fps };
  if (!await canEncodeVideo('avc', videoConfig)) throw new Error(`${height}p・${settings.fps}fpsのH.264エンコードに対応していません。設定を下げるか別のブラウザーをお試しください。`);
  if (hasAudio && !await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate, bitrate: audioEncoding.bitrate })) {
    throw new Error('このブラウザーではAACをエンコードできません。音声付きMP4に対応するブラウザーで開いてください。');
  }

  signal.throwIfAborted();
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('この解像度の描画領域を確保できませんでした。');
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target });
  const frames = new CanvasSource(canvas, { codec: 'avc', bitrate });
  output.addVideoTrack(frames, { frameRate: settings.fps });
  const audio = hasAudio ? new AudioBufferSource(audioEncoding) : undefined;
  if (audio) output.addAudioTrack(audio);
  const cancel = () => { void output.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await output.start();
    if (asset && audio) {
      progress(0, '音楽を準備しています…');
      await encodeAudio(asset.file, clips, duration, audio, signal, progress);
    }

    const groups = groupLayers(layers);
    const total = Math.ceil(duration * settings.fps);
    let previous = '';
    for (let i = 0; i < total; i++) {
      signal.throwIfAborted();
      const time = i / settings.fps;
      const html = renderToStaticMarkup(<Scene groups={groups} time={time} fontProvider={fontProvider} />);
      if (html !== previous || i === 0) await paintFrame(context, html, settings, signal);
      previous = html;
      await frames.add(time, Math.min(1 / settings.fps, duration - time));
      if (i % 6 === 0) {
        progress(0.1 + 0.89 * (i + 1) / total, `映像をエンコードしています（${i + 1}/${total}）`);
        await yieldToBrowser();
      }
    }
    frames.close();
    signal.throwIfAborted();
    progress(0.99, 'MP4ファイルを仕上げています…');
    await output.finalize();
    signal.throwIfAborted();
    if (!target.buffer?.byteLength) throw new Error('MP4データを生成できませんでした。');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    canvas.width = 1;
    canvas.height = 1;
  }
}

