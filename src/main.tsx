import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { defaults, evaluate } from './animation';
import { exampleLayers } from './example';
import { previewGeometry } from './geometry';
import type { Corner, Geometry } from './geometry';
import type { Pose } from './animation';
import { Icon } from './Icon';
import { adjacentEndpoint, CANVAS, DURATION, clamp, editLayerSpan, editSpan, newLayer, reorderById } from './model';
import type { Edge, Layer, Reorder } from './model';
import { formatTime, Timeline } from './Timeline';
import type { Selection } from './Timeline';
import { registry, templates } from './templates';
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
  const [layers, setLayers] = useState(exampleLayers);
  const [selection, setSelection] = useState<Selection | null>(() => ({ layerId: layers[0].id }));
  const [expanded, setExpanded] = useState(() => new Set([layers[0].id]));
  const [time, setTime] = useState(2.4);
  const [playing, setPlaying] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(savedTimelineHeight);
  const editor = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const previewDrag = useRef<{
    id: string; pointer: number; x: number; y: number; base: Geometry; next: Geometry;
    pose: Pose; corner?: Corner;
  } | null>(null);
  const geometryHistory = useRef<{ id: string; base: Geometry }[]>([]);
  const resize = useRef<{ y: number; height: number; value: number } | null>(null);
  const addMenu = useRef<HTMLDivElement>(null);
  const clock = useRef(time);
  const frame = useRef<number | null>(null);
  const nextLayer = useRef(5);
  const layer = layers.find(item => item.id === selection?.layerId);
  const animation = layer?.animations.find(item => item.id === selection?.animationId);
  const template = animation && registry.get(animation.template);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  function pause() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setPlaying(false);
  }

  function togglePlayback() {
    if (frame.current !== null) {
      pause();
      return;
    }
    finishPreviewDrag();
    if (clock.current >= DURATION) {
      clock.current = 0;
      setTime(0);
    }
    const began = performance.now();
    const offset = clock.current;
    function update(now: number) {
      const position = Math.min(DURATION, offset + Math.max(0, now - began) / 1000);
      clock.current = position;
      setTime(position);
      if (position < DURATION) frame.current = requestAnimationFrame(update);
      else pause();
    }
    setAddOpen(false);
    setPlaying(true);
    frame.current = requestAnimationFrame(update);
  }

  useEffect(() => {
    function onSpace(event: KeyboardEvent) {
      if (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (!event.defaultPrevented && !event.isComposing && event.ctrlKey &&
          !event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'z') {
        if (frame.current !== null || previewDrag.current) return;
        const change = geometryHistory.current.pop();
        if (change) {
          event.preventDefault();
          setLayers(items => items.map(item => item.id === change.id ? { ...item, ...change.base } : item));
        }
        return;
      }
      if (event.defaultPrevented || event.code !== 'Space' || event.isComposing ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      if (!event.repeat) togglePlayback();
    }
    window.addEventListener('keydown', onSpace);
    return () => window.removeEventListener('keydown', onSpace);
  }, []);

  useEffect(() => {
    function onJump(event: KeyboardEvent) {
      if (event.defaultPrevented || !event.altKey || event.shiftKey || event.ctrlKey || event.metaKey ||
          event.isComposing || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      if (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault();
      const endpoint = adjacentEndpoint(layers, clock.current, event.key === 'ArrowRight' ? 1 : -1);
      if (endpoint !== undefined) seek(endpoint);
    }
    window.addEventListener('keydown', onJump);
    return () => window.removeEventListener('keydown', onJump);
  }, [layers]);

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
    setAddOpen(false);
  }

  function updateLayer(id: string, update: (item: Layer) => Layer) {
    if (frame.current !== null) return;
    setLayers(items => items.map(item => item.id === id ? update(item) : item));
  }

  function startPreviewDrag(event: PointerEvent<HTMLButtonElement>, item: Layer, pose: Pose, corner?: Corner) {
    if (event.button !== 0 || frame.current !== null || previewDrag.current) return;
    const { x, y, width, height } = item;
    const base = { x, y, width, height };
    previewDrag.current = { id: item.id, pointer: event.pointerId, x: event.clientX, y: event.clientY,
      base, next: base, pose, corner };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection({ layerId: item.id });
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

  function finishPreviewDrag(pointer?: number) {
    const drag = previewDrag.current;
    if (!drag || (pointer !== undefined && pointer !== drag.pointer)) return;
    previewDrag.current = null;
    if (drag.base.x !== drag.next.x || drag.base.y !== drag.next.y ||
        drag.base.width !== drag.next.width || drag.base.height !== drag.next.height) {
      geometryHistory.current.push({ id: drag.id, base: drag.base });
    }
  }

  function addAnimation(id: string) {
    if (!layer || frame.current !== null) return;
    const length = Math.min(1.5, layer.end - layer.start);
    const start = clamp(Math.round(time * 10) / 10, layer.start, Math.round((layer.end - length) * 10) / 10);
    const clip = { id: crypto.randomUUID(), template: id, start, end: Math.round((start + length) * 10) / 10,
      params: defaults(registry.get(id)!) };
    updateLayer(layer.id, item => ({ ...item, animations: [...item.animations, clip] }));
    openLayer(layer.id);
    setSelection({ layerId: layer.id, animationId: clip.id });
  }

  function edit(target: Selection, edge: Edge, delta: number, original?: Layer) {
    updateLayer(target.layerId, item => {
      const source = original ?? item;
      if (!target.animationId) return editLayerSpan(source, edge, delta);
      return { ...item, animations: item.animations.map(clip => {
        if (clip.id !== target.animationId) return clip;
        const initial = source.animations.find(entry => entry.id === clip.id) ?? clip;
        return { ...clip, ...editSpan(initial, edge, delta, item) };
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
    geometryHistory.current = geometryHistory.current.filter(change => change.id !== layer.id);
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
      setLayers(items => reorderById(items, source.layerId, target));
    }
  }

  return <main className="editor" ref={editor} style={{
    '--timeline-height': timelineHeight === null ? undefined : `${timelineHeight}px`,
  } as CSSProperties}>
    <header className="app-header">
      <div className="brand"><span className="brand-icon"><Icon name="logo" size={22} /></span><h1>MV <em>Easy</em></h1></div>
      <span className="header-divider" />
      <span className="project-name">文字PVエディター</span>
      <div className="add-area" ref={addMenu} onKeyDown={event => { if (event.key === 'Escape') setAddOpen(false); }}>
        <button type="button" className="primary add-button" aria-expanded={addOpen} disabled={playing}
          onClick={() => setAddOpen(open => !open)}><Icon name="plus" />追加<Icon name="down" size={13} /></button>
        {addOpen && <div className="add-menu">{kinds.map(([kind, label]) =>
          <button type="button" key={kind} onClick={() => addLayer(kind)}><Icon name={kind} />{label}</button>)}</div>}
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
            {layers.slice().reverse().map(item => {
              const pose = evaluate(item, time, registry);
              if (pose.opacity === 0 || pose.scale === 0) return null;
              const selected = !playing && layer?.id === item.id;
              const pointerHandlers = {
                onPointerMove: movePreviewDrag,
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
                  style={{ backgroundColor: item.kind === 'text' ? 'transparent' : pose.color }}
                  onClick={() => setSelection({ layerId: item.id })}
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
          <div className="timecode"><Icon name="clock" size={15} /><strong>{formatTime(time)}</strong><span>/ {formatTime(DURATION)}</span></div>
          <div className="transport-buttons">
            <button type="button" className="icon-button" aria-label="最初へ" onClick={() => seek(0)}><Icon name="first" /></button>
            <button type="button" className="primary play-button" aria-label={playing ? '一時停止' : '再生'}
              onClick={togglePlayback}>
              <Icon name={playing ? 'pause' : 'play'} size={19} /></button>
            <button type="button" className="icon-button" aria-label="最後へ" onClick={() => seek(DURATION)}><Icon name="last" /></button>
          </div>
          <span className="aspect">16:9</span>
        </div>
      </section>
      <aside className="inspector">
        <div className="panel-title"><Icon name="panel" size={17} /><h2>プロパティ</h2></div>
        {layer ? <>
          <div className="inspector-selection"><span className="selection-icon"><Icon name={template?.icon ?? layer.kind} size={19} /></span>
            <div><strong>{template?.label ?? layer.name}</strong><small>{template ? layer.name : kinds.find(([kind]) => kind === layer.kind)?.[1]}</small></div>
            <button type="button" className="icon-button delete" aria-label={animation ? 'アニメーションを削除' : 'レイヤーを削除'}
              disabled={playing} onClick={removeSelection}><Icon name="trash" size={17} /></button></div>
          {animation && template ? <fieldset className="properties" key={animation.id} disabled={playing}>
            <h3>アニメーション設定</h3>
            <div className="clip-range">{formatTime(animation.start)} — {formatTime(animation.end)}</div>
            {template.controls.map(control => {
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
            {layer.kind === 'text' && <label>テキスト<textarea rows={2} value={layer.text}
              onChange={event => { const text = event.target.value; updateLayer(layer.id, item => ({ ...item, text })); }} /></label>}
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
        const available = editor.current!.clientHeight - editor.current!.firstElementChild!.clientHeight - event.currentTarget.offsetHeight;
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
    <Timeline layers={layers} selection={selection} expanded={expanded} time={time} playing={playing} onReorder={reorder}
      onSelect={setSelection} onSeek={seek} onEdit={edit} onToggle={id => setExpanded(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      })} />
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
