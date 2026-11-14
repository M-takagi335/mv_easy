import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { defaults, evaluate } from './animation';
import { exampleLayers } from './example';
import { previewGeometry } from './geometry';
import type { Corner, Geometry } from './geometry';
import type { Pose } from './animation';
import { Icon } from './Icon';
import { adjacentEndpoint, animationTimelineSpan, CANVAS, DURATION, clamp, editAnimationSpan, editLayerSpan, groupLayers, initialAnimationSpan, migrateAbsoluteAnimations, newLayer, packLayers, reorderById, splitLayer, trackId, unpackLayers } from './model';
import type { Edge, Layer, Reorder } from './model';
import { formatTime, Timeline } from './Timeline';
import type { Selection } from './Timeline';
import { registry, templates } from './templates';
import { FontPicker } from './FontPicker';
import { createBrowserFontProvider, resolveTextFont } from './fonts';
import type { FontOption } from './fonts';
import { editMusic, readMusic, sourceTime, splitMusic } from './music';
import type { MusicClip } from './music';
import { readProject, saveProject } from './project';
import type { MusicAsset } from './project';
import { createHistory } from './history';
import './style.css';

const kinds = [['text', 'テキスト'], ['rectangle', '四角形'], ['ellipse', '円・楕円']] as const;
const heightKey = 'mv-easy.timeline-height';
const minimumTimelineHeight = 160;
const minimumWorkspaceHeight = 270;
const corners = [
  ['左上', [-1, -1]], ['右上', [1, -1]], ['左下', [-1, 1]], ['右下', [1, 1]],
] as const;

function savedTimelineHeight() {
  try {
    const value = Number(localStorage.getItem(heightKey));
    return Number.isFinite(value) && value >= minimumTimelineHeight ? value : null;
  } catch {
    return null;
  }
}
const objectFields = [
  ['x', '位置 X', -3840, 5760], ['y', '位置 Y', -2160, 3240],
  ['width', '幅', 1, 3840], ['height', '高さ', 1, 2160], ['rotation', '回転 (°)', -3600, 3600],
] as const;

function NumberField({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget.value;
    if (input.trim() && Number.isFinite(Number(input))) onChange(clamp(Number(input), min, max));
    setDraft(null);
  }
  return <label>{label}<input type="number" min={min} max={max} step={step} value={draft ?? value}
    onChange={event => {
      setDraft(event.target.value);
      const next = event.target.valueAsNumber;
      if (Number.isFinite(next) && next >= min && next <= max) onChange(next);
    }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}

function App() {
  const [fontProvider] = useState(createBrowserFontProvider);
  const [fonts, setFonts] = useState<FontOption[]>([]);
  type EditData = { layers: Layer[]; musicClips: MusicClip[]; asset?: MusicAsset };
  const [history] = useState(() => createHistory<EditData>({ layers: exampleLayers(), musicClips: [] },
    (a, b) => a.asset === b.asset && JSON.stringify(a.layers) === JSON.stringify(b.layers) &&
      JSON.stringify(a.musicClips) === JSON.stringify(b.musicClips)));
  const [{ layers, musicClips, asset }, setEditData] = useState(history.current);
  function setLayers(update: (items: Layer[]) => Layer[]) {
    setEditData(history.update(data => ({ ...data, layers: update(data.layers) })));
  }
  function setMusicClips(update: MusicClip[] | ((items: MusicClip[]) => MusicClip[])) {
    setEditData(history.update(data => ({ ...data, musicClips: typeof update === 'function' ? update(data.musicClips) : update })));
  }
  function finishEdit(cancel = false) { setEditData(history.finish(cancel)); }
  const [selection, setSelection] = useState<Selection | null>(() => ({ layerId: layers[0].id }));
  const [expanded, setExpanded] = useState(() => new Set([layers[0].id]));
  const [time, setTime] = useState(2.4);
  const [selectedMusicId, setSelectedMusicId] = useState<string>();
  const music = musicClips.find(clip => clip.id === selectedMusicId);
  const musicSelected = music !== undefined;
  const copiedText = useRef<Layer | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingMusic, setLoadingMusic] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [animationError, setAnimationError] = useState('');
  const media = useRef<HTMLAudioElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const relinking = useRef(false);
  const duration = Math.max(DURATION, ...musicClips.map(clip => clip.end), ...layers.map(item => item.end));
  const [playing, setPlaying] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(savedTimelineHeight);
  const editor = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const previewDrag = useRef<{
    id: string; pointer: number; x: number; y: number; base: Geometry; next: Geometry;
    pose: Pose; corner?: Corner;
  } | null>(null);
  const resize = useRef<{ y: number; height: number; value: number } | null>(null);
  const addMenu = useRef<HTMLDivElement>(null);
  const clock = useRef(time);
  const frame = useRef<number | null>(null);
  const playbackSession = useRef(0);
  const nextLayer = useRef(5);
  const layer = musicSelected ? undefined : layers.find(item => item.id === selection?.layerId);
  const animation = layer?.animations.find(item => item.id === selection?.animationId);
  const animationRange = layer && animation ? animationTimelineSpan(layer, animation) : undefined;
  const template = animation && registry.get(animation.template);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  useEffect(() => {
    readProject().then(result => {
      if (result.project) {
        const unpacked = unpackLayers(result.project.layers);
        const restoredLayers = result.project.animationTime === 'relative' ? unpacked : unpacked.map(migrateAbsoluteAnimations);
        const clips = result.project.musicClips ?? (result.project.music ? [result.project.music] : []);
        const restored = clips.map(clip => ({ ...clip, id: clip.id ?? crypto.randomUUID() }));
        history.reset({ layers: restoredLayers, musicClips: restored, asset: result.asset });
        setEditData(history.current);
        setSelection(restoredLayers[0] ? { layerId: restoredLayers[0].id } : null);
        if (!result.asset) setSelectedMusicId(restored[0]?.id);
        setExpanded(new Set(restoredLayers[0] ? [restoredLayers[0].id] : []));
        nextLayer.current = result.project.layers.length + 1;
      }
      setReady(true);
    }).catch(() => {
      setStorageError('保存済みプロジェクトを開けませんでした。');
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      saveProject({ layers: packLayers(layers), music: musicClips[0] ?? null, musicClips, animationTime: 'relative' }, asset).then(() => {
        setStorageError('');
      }).catch(() => setStorageError('プロジェクトを保存できませんでした。ブラウザーの空き容量を確認してください。'));
    }, 350);
    return () => clearTimeout(timer);
  }, [ready, layers, musicClips, asset]);

  useEffect(() => {
    const audio = media.current!;
    if (!asset) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    const url = URL.createObjectURL(asset.file);
    audio.src = url;
    const clip = musicAt(clock.current);
    if (clip) audio.currentTime = sourceTime(clip, clock.current);
    return () => { audio.pause(); URL.revokeObjectURL(url); };
  }, [asset]);

  async function importMusic(file: File) {
    setLoadingMusic(true);
    setAudioError('');
    try {
      const decoded = await readMusic(file);
      const start = relinking.current && music ? music.start : 0;
      const inPoint = relinking.current && music ? Math.min(music.inPoint, Math.max(0, decoded.duration - 0.1)) : 0;
      const length = relinking.current && music ? Math.min(music.end - music.start, decoded.duration - inPoint) : decoded.duration;
      const id = crypto.randomUUID();
      const reference = { id, name: file.name, duration: decoded.duration };
      const imported = { id, asset: reference, start, end: start + length, inPoint,
        volume: music?.volume ?? 1, muted: music?.muted ?? false };
      const clips = relinking.current && music ? musicClips.map(clip => {
        if (clip === music) return imported;
        const offset = Math.min(clip.inPoint, Math.max(0, decoded.duration - 0.1));
        return { ...clip, asset: reference, inPoint: offset, end: clip.start + Math.min(clip.end - clip.start, decoded.duration - offset) };
      }) : [imported];
      setEditData(history.update(data => ({ ...data, musicClips: clips, asset: { file, peaks: decoded.peaks } })));
      setSelectedMusicId(id);
      const limit = Math.max(DURATION, ...clips.map(clip => clip.end), ...layers.map(item => item.end));
      if (clock.current > limit) seek(limit);
    } catch {
      setAudioError('音声を読み込めませんでした。再生できる MP3・WAV・M4A ファイルを選んでください。');
    } finally {
      setLoadingMusic(false);
    }
  }

  function pause() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    media.current?.pause();
    setPlaying(false);
  }

  function musicAt(position: number) {
    return musicClips.find(clip => position >= clip.start && position < clip.end);
  }

  function togglePlayback() {
    if (frame.current !== null) {
      const active = musicAt(clock.current);
      if (active && asset && !media.current!.paused) {
        const position = clamp(active.start + media.current!.currentTime - active.inPoint, active.start, active.end);
        clock.current = position;
        setTime(position);
      }
      pause();
      return;
    }
    if (!ready || loadingMusic) return;
    finishPreviewDrag();
    if (clock.current >= duration) {
      clock.current = 0;
      setTime(0);
    }
    let began = performance.now();
    let offset = clock.current;
    const audio = media.current!;
    const clips = asset ? [...musicClips].sort((a, b) => a.start - b.start) : [];
    let cursor = clips.findIndex(clip => clip.end > offset);
    let active: MusicClip | undefined;
    function startAudio(clip: MusicClip, position: number) {
      active = clip;
      audio.currentTime = sourceTime(clip, position);
      audio.volume = clip.volume;
      audio.muted = clip.muted;
      const session = playbackSession.current;
      void audio.play().catch(() => {
        if (session !== playbackSession.current || frame.current === null) return;
        pause();
        setAudioError('音声を再生できませんでした。再リンクしてから再生してください。');
      });
    }
    function update(now: number) {
      let position = Math.min(duration, offset + Math.max(0, now - began) / 1000);
      const clip = active;
      if (clip) {
        position = audio.ended ? clip.end : clamp(clip.start + audio.currentTime - clip.inPoint, clip.start, clip.end);
        if (position >= clip.end - 0.00001) {
          position = clip.end;
          active = undefined;
          cursor++;
          began = now;
          offset = position;
          const next = clips[cursor];
          if (next && next.start <= position) {
            if (!audio.ended && Math.abs(sourceTime(next, position) - audio.currentTime) < 0.045) {
              active = next;
              audio.volume = next.volume;
              audio.muted = next.muted;
            } else startAudio(next, position);
          } else audio.pause();
        }
      } else if (clips[cursor] && position >= clips[cursor].start) {
        position = clips[cursor].start;
        startAudio(clips[cursor], position);
      }
      clock.current = position;
      setTime(position);
      if (position < duration) frame.current = requestAnimationFrame(update);
      else pause();
    }
    setAddOpen(false);
    setPlaying(true);
    playbackSession.current++;
    if (clips[cursor] && offset >= clips[cursor].start) startAudio(clips[cursor], offset);
    frame.current = requestAnimationFrame(update);
  }

  useEffect(() => {
    function onSpace(event: KeyboardEvent) {
      if (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (!event.defaultPrevented && !event.isComposing && event.ctrlKey && !event.altKey && !event.metaKey &&
          !event.shiftKey && frame.current === null && layer?.kind === 'text') {
        if (event.code === 'KeyC') {
          copiedText.current = layer;
          event.preventDefault();
          return;
        }
        if (event.code === 'KeyV' && copiedText.current && !event.repeat) {
          event.preventDefault();
          addLyric(layer, copiedText.current);
          return;
        }
      }
      const key = event.key.toLowerCase();
      if (!event.defaultPrevented && !event.isComposing && event.ctrlKey &&
          !event.altKey && !event.metaKey && (key === 'z' || (key === 'y' && !event.shiftKey))) {
        if (frame.current !== null || previewDrag.current) return;
        event.preventDefault();
        const restored = history.step(key === 'y' || event.shiftKey);
        setEditData(restored);
        if (selection) {
          const restoredLayer = restored.layers.find(item => item.id === selection.layerId);
          const splitSibling = layer && restoredLayer?.end !== layer.end
            ? restored.layers.find(item => trackId(item) === trackId(layer) &&
              item.start <= clock.current && clock.current < item.end)
            : undefined;
          const selected = splitSibling ?? restoredLayer;
          const animationId = selected?.animations.find(item => item.id === selection.animationId)?.id;
          setSelection(selected ? { layerId: selected.id, animationId } : null);
          if (selected && expanded.has(selection.layerId)) openLayer(selected.id);
        }
        if (!restored.musicClips.some(item => item.id === selectedMusicId)) setSelectedMusicId(undefined);
        const limit = Math.max(DURATION, ...restored.layers.map(item => item.end), ...restored.musicClips.map(item => item.end));
        if (clock.current > limit) {
          clock.current = limit;
          setTime(limit);
        }
        return;
      }
      if (!event.defaultPrevented && !event.isComposing && !event.repeat && event.code === 'KeyX' &&
          !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
          frame.current === null && !previewDrag.current && !loadingMusic && ready) {
        event.preventDefault();
        cut();
        return;
      }
      if (event.defaultPrevented || event.code !== 'Space' || event.isComposing ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      if (!event.repeat) togglePlayback();
    }
    window.addEventListener('keydown', onSpace);
    return () => window.removeEventListener('keydown', onSpace);
  }, [duration, musicClips, music, asset, ready, loadingMusic, layers, layer, selection, selectedMusicId, expanded]);

  useEffect(() => {
    function onJump(event: KeyboardEvent) {
      if (event.defaultPrevented || !event.altKey || event.shiftKey || event.ctrlKey || event.metaKey ||
          event.isComposing || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      if (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault();
      const endpoint = adjacentEndpoint(layers, clock.current, event.key === 'ArrowRight' ? 1 : -1, musicClips);
      if (endpoint !== undefined) seek(endpoint);
    }
    window.addEventListener('keydown', onJump);
    return () => window.removeEventListener('keydown', onJump);
  }, [layers, musicClips, asset]);

  useEffect(() => {
    if (!addOpen) return;
    function close(event: globalThis.PointerEvent) {
      if (!addMenu.current?.contains(event.target as Node)) setAddOpen(false);
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [addOpen]);

  function seek(position: number) {
    finishPreviewDrag();
    pause();
    const clip = musicAt(position) ?? musicClips.find(item => item.start > position);
    if (clip && asset) media.current!.currentTime = sourceTime(clip, Math.max(position, clip.start));
    clock.current = position;
    setTime(position);
  }

  function openLayer(id: string) {
    setExpanded(current => new Set([...current, id]));
  }

  function addLayer(kind: Layer['kind']) {
    if (frame.current !== null) return;
    const item = newLayer(kind, nextLayer.current++);
    setLayers(current => [item, ...current]);
    setSelection({ layerId: item.id });
    setSelectedMusicId(undefined);
    setAddOpen(false);
  }

  function addLyric(target: Layer, source?: Layer) {
    if (frame.current !== null) return;
    const id = trackId(target);
    const siblings = layers.filter(item => trackId(item) === id).sort((a, b) => a.start - b.start);
    let start = clock.current;
    const length = source ? source.end - source.start : 2;
    for (const sibling of siblings) {
      if (start + length <= sibling.start) break;
      if (start < sibling.end) start = sibling.end;
    }
    const item: Layer = {
      ...(source ?? target), id: crypto.randomUUID(), textTrackId: id, start, end: start + length,
      endExclusive: true, name: target.name, text: source?.text ?? 'テキストを入力',
      animations: source?.animations.map(animation => ({
        ...animation, id: crypto.randomUUID(), params: { ...animation.params },
      })) ?? [],
    };
    setLayers(items => [...items, item]);
    setSelection({ layerId: item.id });
    seek(start);
    setSelectedMusicId(undefined);
    setAddOpen(false);
  }

  function updateLayer(id: string, update: (item: Layer) => Layer) {
    if (frame.current !== null) return;
    setLayers(items => items.map(item => item.id === id ? update(item) : item));
  }

  function startPreviewDrag(event: PointerEvent<HTMLButtonElement>, item: Layer, pose: Pose, corner?: Corner) {
    if (event.button !== 0 || frame.current !== null || previewDrag.current) return;
    event.currentTarget.focus({ preventScroll: true });
    history.begin();
    const { x, y, width, height } = item;
    const base = { x, y, width, height };
    previewDrag.current = { id: item.id, pointer: event.pointerId, x: event.clientX, y: event.clientY,
      base, next: base, pose, corner };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection({ layerId: item.id });
    setSelectedMusicId(undefined);
  }

  function movePreviewDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = previewDrag.current;
    if (!drag || drag.pointer !== event.pointerId || frame.current !== null) return;
    const bounds = canvas.current!.getBoundingClientRect();
    drag.next = previewGeometry(drag.base, drag.pose,
      (event.clientX - drag.x) * CANVAS.width / bounds.width,
      (event.clientY - drag.y) * CANVAS.height / bounds.height, drag.corner);
    const next = drag.next;
    updateLayer(drag.id, item => ({ ...item, ...next }));
  }

  function finishPreviewDrag(pointer?: number, cancel = false) {
    const drag = previewDrag.current;
    if (!drag || (pointer !== undefined && pointer !== drag.pointer)) return;
    previewDrag.current = null;
    finishEdit(cancel);
  }

  function addAnimation(id: string) {
    if (!layer || frame.current !== null) return;
    const span = initialAnimationSpan(layer, clock.current);
    if (!span) {
      setAnimationError('再生位置からクリップの終了までに、アニメーションを追加できる1フレーム分の余裕がありません。');
      return;
    }
    setAnimationError('');
    const clip = { id: crypto.randomUUID(), template: id, ...span,
      params: defaults(registry.get(id)!) };
    updateLayer(layer.id, item => ({ ...item, animations: [...item.animations, clip] }));
    openLayer(layer.id);
    setSelection({ layerId: layer.id, animationId: clip.id });
  }

  function cut() {
    if (music) {
      const halves = splitMusic(music, clock.current);
      if (!halves) return;
      setMusicClips(items => items.flatMap(item => item.id === music.id ? halves : [item]));
      setSelectedMusicId(halves[1].id);
    } else if (layer) {
      const halves = splitLayer(layer, clock.current);
      if (!halves) return;
      setLayers(items => items.flatMap(item => item.id === layer.id ? halves : [item]));
      setSelection({ layerId: halves[1].id });
      setExpanded(current => {
        if (!current.has(layer.id)) return current;
        const next = new Set(current);
        next.delete(layer.id);
        halves.forEach(half => next.add(half.id));
        return next;
      });
    }
  }

  function edit(target: Selection, edge: Edge, delta: number, original?: Layer) {
    updateLayer(target.layerId, item => {
      const source = original ?? item;
      if (!target.animationId) {
        const siblings = layers.filter(entry => entry.id !== source.id && trackId(entry) === trackId(source));
        const earliest = Math.max(0, ...siblings.filter(entry => entry.end <= source.start).map(entry => entry.end));
        const latest = Math.min(duration, ...siblings.filter(entry => entry.start >= source.end).map(entry => entry.start));
        return editLayerSpan(source, edge, delta, latest, earliest);
      }
      return { ...item, animations: item.animations.map(clip => {
        if (clip.id !== target.animationId) return clip;
        const initial = source.animations.find(entry => entry.id === clip.id) ?? clip;
        return { ...clip, ...editAnimationSpan(initial, edge, delta, item, duration) };
      }) };
    });
  }

  function removeSelection() {
    if (!layer || frame.current !== null) return;
    if (animation) {
      updateLayer(layer.id, item => ({ ...item, animations: item.animations.filter(clip => clip.id !== animation.id) }));
      setSelection({ layerId: layer.id });
      return;
    }
    setLayers(items => items.filter(item => item.id !== layer.id));
    setExpanded(current => {
      const next = new Set(current);
      next.delete(layer.id);
      return next;
    });
    setSelection(null);
  }

  function reorder(source: Selection, target: Reorder) {
    if (frame.current !== null) return;
    const id = source.animationId;
    if (id !== undefined) {
      updateLayer(source.layerId, item => ({ ...item, animations: reorderById(item.animations, id, target) }));
    } else {
      setLayers(items => {
        const groups = groupLayers(items).map(group => ({ id: trackId(group[0]), group }));
        return reorderById(groups, source.layerId, target).flatMap(group => group.group);
      });
    }
  }

  return <main className="editor" ref={editor} style={{
    '--timeline-height': timelineHeight === null ? undefined : `${timelineHeight}px`,
  } as CSSProperties}>
    <audio ref={media} preload="auto" hidden />
    <input ref={picker} type="file" hidden accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
      onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file && frame.current === null) void importMusic(file);
      }} />
    <header className="app-header">
      <div className="brand"><span className="brand-icon"><Icon name="logo" size={22} /></span><h1>MV <em>Easy</em></h1></div>
      <span className="header-divider" />
      <span className="project-name">文字PVエディター</span>
      <div className="add-area" ref={addMenu} onKeyDown={event => { if (event.key === 'Escape') setAddOpen(false); }}>
        <button type="button" className="primary add-button" aria-expanded={addOpen} disabled={playing || !ready || loadingMusic}
          onClick={() => setAddOpen(open => !open)}><Icon name="plus" />追加<Icon name="down" size={13} /></button>
        {addOpen && <div className="add-menu">{kinds.map(([kind, label]) =>
          <button type="button" key={kind} onClick={() => addLayer(kind)}><Icon name={kind} />{label}</button>)}
          {layer?.kind === 'text' && <button type="button" onClick={() => addLyric(layer)}>同じレイヤーに歌詞を追加</button>}
          <button type="button" onClick={() => { relinking.current = false; setAddOpen(false); picker.current?.click(); }}>♫ 音楽を読み込む</button>
        </div>}
      </div>
    </header>
    <div className="workspace">
      <aside className="library">
        <div className="panel-title"><Icon name="spark" size={17} /><h2>テンプレート</h2></div>
        <p>レイヤーを選んでアニメーションを追加</p>
        <div className="template-grid">{templates.map(item => <button type="button" key={item.id} disabled={!layer || playing}
          className={`template-card ${item.tone}`} onClick={() => addAnimation(item.id)}>
          <span className="template-icon"><Icon name={item.icon} size={22} /></span><span>{item.label}</span>
        </button>)}</div>
      </aside>
      <section className="monitor" aria-label="プレビュー">
        <div className="monitor-head"><h2>プレビュー</h2><span>1920 × 1080</span></div>
        <div className="stage">
          <div className="canvas" ref={canvas}>
            {groupLayers(layers).flatMap(group => {
              const nextStarts = new Set(group.map(item => item.start));
              return group.filter(item => item.end !== time || !nextStarts.has(time));
            }).reverse().map(item => {
              const pose = evaluate(item, time, registry);
              if (pose.opacity === 0 || pose.scale === 0) return null;
              const selected = !playing && layer?.id === item.id;
              const typography = item.kind === 'text' ? resolveTextFont(item, fontProvider) : undefined;
              const pointerHandlers = {
                onPointerMove: movePreviewDrag,
                onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finishPreviewDrag(event.pointerId, true),
                onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finishPreviewDrag(event.pointerId),
              };
              return <div key={item.id} className="canvas-object"
                style={{
                  left: `${pose.x / CANVAS.width * 100}%`, top: `${pose.y / CANVAS.height * 100}%`,
                  width: `${item.width / CANVAS.width * 100}%`, height: `${item.height / CANVAS.height * 100}%`,
                  fontSize: `${item.fontSize / CANVAS.width * 100}cqw`, opacity: pose.opacity,
                  transform: `translate(-50%, -50%) rotate(${pose.rotation}deg) scale(${pose.scale})`,
                  color: pose.color,
                }}>
                <button type="button" aria-label={item.name} disabled={playing}
                  className={`canvas-content ${item.kind} ${selected ? 'canvas-selected' : ''}`}
                  style={typography ? {
                    fontFamily: typography.fontFamily, fontWeight: typography.fontWeight, fontStyle: typography.fontStyle,
                  } : { backgroundColor: pose.color }}
                  onClick={() => { setSelection({ layerId: item.id }); setSelectedMusicId(undefined); }}
                  onPointerDown={event => startPreviewDrag(event, item, pose)} {...pointerHandlers}>
                  {item.kind === 'text' && item.text}
                </button>
                {selected && corners.map(([label, corner]) => <button type="button" key={label}
                  aria-label={`${item.name}の${label}をリサイズ`} className="preview-handle"
                  style={{ left: corner[0] < 0 ? 0 : '100%', top: corner[1] < 0 ? 0 : '100%',
                    cursor: corner[0] === corner[1] ? 'nwse-resize' : 'nesw-resize',
                    transform: `translate(-50%, -50%) scale(${1 / pose.scale})` }}
                  onPointerDown={event => startPreviewDrag(event, item, pose, corner)} {...pointerHandlers} />)}
              </div>;
            })}
          </div>
        </div>
        <div className="transport">
          <div className="timecode"><Icon name="clock" size={15} /><strong>{formatTime(time)}</strong><span>/ {formatTime(duration)}</span></div>
          <div className="transport-buttons">
            <button type="button" className="icon-button" aria-label="最初へ" onClick={() => seek(0)}><Icon name="first" /></button>
            <button type="button" className="primary play-button" aria-label={playing ? '一時停止' : '再生'}
              onClick={togglePlayback}>
              <Icon name={playing ? 'pause' : 'play'} size={19} /></button>
            <button type="button" className="icon-button" aria-label="最後へ" onClick={() => seek(duration)}><Icon name="last" /></button>
          </div>
          <span className="aspect">16:9</span>
        </div>
      </section>
      <aside className="inspector"
        onFocus={event => {
          if (event.target.matches('textarea, input[type="number"], input[type="color"], input[type="range"]')) history.begin();
        }}
        onBlur={event => {
          if (event.target.matches('textarea, input[type="number"], input[type="color"], input[type="range"]')) finishEdit();
        }}
        onPointerDown={event => {
          if (event.target instanceof HTMLInputElement && event.target.type === 'range') history.begin();
        }}
        onPointerUp={event => {
          if (event.target instanceof HTMLInputElement && event.target.type === 'range') finishEdit();
        }}
        onPointerCancel={event => {
          if (event.target instanceof HTMLInputElement && event.target.type === 'range') finishEdit(true);
        }}>
        <div className="panel-title"><Icon name="panel" size={17} /><h2>プロパティ</h2></div>
        {loadingMusic && <p role="status">音声と波形を読み込んでいます…</p>}
        {audioError && <p role="alert">{audioError}</p>}
        {storageError && <p role="alert">{storageError}</p>}
        {animationError && <p role="alert">{animationError}</p>}
        {musicSelected && music ? <>
          <div className="inspector-selection"><div><strong title={music.asset.name}>{music.asset.name}</strong><small>音楽</small></div>
            <button type="button" className="icon-button delete" aria-label="音楽を削除" disabled={playing || loadingMusic}
              onClick={() => {
                const remaining = musicClips.filter(item => item.id !== music.id);
                setMusicClips(remaining); setSelectedMusicId(undefined); setAudioError('');
                seek(Math.min(clock.current, Math.max(DURATION, ...layers.map(item => item.end), ...remaining.map(item => item.end))));
              }}><Icon name="trash" size={17} /></button>
          </div>
          <fieldset className="properties" disabled={playing || loadingMusic}>
            <div className="clip-range">{formatTime(music.start)} — {formatTime(music.end)}</div>
            {!asset && <p role="status">音声ファイルが見つかりません。</p>}
            <label>音量 {Math.round(music.volume * 100)}%
              <input type="range" min="0" max="1" step="0.01" value={music.volume}
                onChange={event => { const volume = event.target.valueAsNumber; setMusicClips(items => items.map(item => item.id === music.id ? { ...item, volume } : item)); }} />
            </label>
            <label className="music-mute"><input type="checkbox" checked={music.muted}
              onChange={event => { const muted = event.target.checked; setMusicClips(items => items.map(item => item.id === music.id ? { ...item, muted } : item)); }} />ミュート</label>
            <button type="button" className="primary music-relink" onClick={() => {
              relinking.current = true; picker.current?.click();
            }}>音声を再リンク</button>
          </fieldset>
        </> : layer ? <>
          <div className="inspector-selection"><span className="selection-icon"><Icon name={template?.icon ?? layer.kind} size={19} /></span>
            <div><strong>{template?.label ?? layer.name}</strong><small>{template ? layer.name : kinds.find(([kind]) => kind === layer.kind)?.[1]}</small></div>
            <button type="button" className="icon-button delete" aria-label={animation ? 'アニメーションを削除' : 'レイヤーを削除'}
              disabled={playing} onClick={removeSelection}><Icon name="trash" size={17} /></button></div>
          {animation ? <fieldset className="properties" key={animation.id} disabled={playing}>
            <h3>アニメーション設定</h3>
            <div className="clip-range">{formatTime(animationRange!.start)} — {formatTime(animationRange!.end)}</div>
            {!template && <p role="status">このテンプレートは現在のバージョンでは再生できません。</p>}
            {template?.controls.map(control => {
              const value = animation.params[control.key];
              const change = (next: number | string) => updateLayer(layer.id, item => ({
                ...item, animations: item.animations.map(clip => clip.id === animation.id
                  ? { ...clip, params: { ...clip.params, [control.key]: next } } : clip),
              }));
              if ('min' in control) return <NumberField key={control.key} label={control.label}
                min={control.min} max={control.max} step={control.step} value={Number(value)} onChange={change} />;
              if ('options' in control) return <label key={control.key}>{control.label}
                <select value={value} onChange={event => change(event.target.value)}>
                  {control.options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select></label>;
              return <label key={control.key}>{control.label}<input type="color" value={String(value)}
                onChange={event => change(event.target.value)} /></label>;
            })}
          </fieldset> : <fieldset className="properties" key={layer.id} disabled={playing}>
            {layer.kind === 'text' && <>
              <label>テキスト<textarea rows={2} value={layer.text}
                onChange={event => { const text = event.target.value; updateLayer(layer.id, item => ({ ...item, text })); }} /></label>
              {!playing && <FontPicker family={layer.fontFamily} fonts={fonts} provider={fontProvider}
                unavailable={resolveTextFont(layer, fontProvider).unavailable}
                onLoad={async () => {
                  const installed = await fontProvider.list();
                  setFonts(installed);
                  return installed.length;
                }}
                onChange={fontFamily => updateLayer(layer.id, item => ({ ...item, fontFamily }))} />}
              <div className="font-toggles">
                <label><input type="checkbox" checked={resolveTextFont(layer, fontProvider).fontWeight >= 700}
                  onChange={event => { const fontBold = event.target.checked; updateLayer(layer.id, item => ({ ...item, fontBold })); }} />太字</label>
                <label><input type="checkbox" checked={layer.fontItalic ?? false}
                  onChange={event => { const fontItalic = event.target.checked; updateLayer(layer.id, item => ({ ...item, fontItalic })); }} />斜体</label>
              </div>
            </>}
            <h3>位置・サイズ</h3>
            <div className="field-grid">
              {objectFields.map(([key, label, min, max]) => <NumberField key={key} label={label} min={min} max={max}
                value={layer[key]} onChange={value => updateLayer(layer.id, item => ({ ...item, [key]: value }))} />)}
              {layer.kind === 'text' && <NumberField label="文字サイズ" min={1} max={720} value={layer.fontSize}
                onChange={fontSize => updateLayer(layer.id, item => ({ ...item, fontSize }))} />}
            </div>
            <label>カラー<span className="color-field"><input type="color" value={layer.color}
              onChange={event => { const color = event.target.value; updateLayer(layer.id, item => ({ ...item, color })); }} />
              <span>{layer.color.toUpperCase()}</span></span></label>
          </fieldset>}
        </> : <p>タイムラインかプレビューでレイヤーを選択してください。</p>}
      </aside>
    </div>
    <div className="timeline-divider" role="separator" aria-label="タイムラインの高さ"
      aria-orientation="horizontal" onPointerDown={event => {
        if (event.button !== 0 || resize.current) return;
        event.preventDefault();
        const height = event.currentTarget.nextElementSibling!.getBoundingClientRect().height;
        resize.current = { y: event.clientY, height, value: height };
        event.currentTarget.setPointerCapture(event.pointerId);
        editor.current?.classList.add('resizing-timeline');
      }} onPointerMove={event => {
        const drag = resize.current;
        if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const available = editor.current!.clientHeight - editor.current!.querySelector('.app-header')!.clientHeight - event.currentTarget.offsetHeight;
        drag.value = Math.round(clamp(drag.height + drag.y - event.clientY, minimumTimelineHeight,
          Math.max(minimumTimelineHeight, available - minimumWorkspaceHeight)));
        setTimelineHeight(drag.value);
      }} onLostPointerCapture={() => {
        const drag = resize.current;
        resize.current = null;
        editor.current?.classList.remove('resizing-timeline');
        if (drag && drag.value !== drag.height) {
          try { localStorage.setItem(heightKey, String(drag.value)); } catch { /* Storage may be unavailable. */ }
        }
      }} />
    <Timeline layers={layers} selection={musicSelected ? null : selection} expanded={expanded} time={time}
      duration={duration} musicClips={musicClips} peaks={asset?.peaks} selectedMusicId={selectedMusicId}
      onSelectMusic={setSelectedMusicId} onEditMusic={(edge, delta, original) => {
        if (frame.current !== null || loadingMusic) return;
        const next = editMusic(original, edge, delta);
        if (musicClips.some(item => item.id !== original.id &&
          next.start < item.end - 1e-8 && next.end > item.start + 1e-8)) return;
        const clips = musicClips.map(item => item.id === original.id ? next : item);
        setMusicClips(clips);
        const limit = Math.max(DURATION, ...clips.map(item => item.end), ...layers.map(item => item.end));
        if (clock.current > limit) seek(limit);
        if (asset) media.current!.currentTime = sourceTime(next, clamp(clock.current, next.start, next.end));
      }}
      playing={playing} onReorder={reorder}
      onSelect={target => { setSelection(target); setSelectedMusicId(undefined); }} onSeek={seek} onEdit={edit}
      onEditStart={() => history.begin()} onEditFinish={finishEdit}
      onRename={(id, name) => {
        if (frame.current !== null) return;
        const previous = layers.find(item => trackId(item) === id)?.name;
        if (previous === undefined || previous === name) return;
        setLayers(items => items.map(item => trackId(item) === id ? { ...item, name } : item));
      }}
      onToggle={id => setExpanded(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      })} />
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
