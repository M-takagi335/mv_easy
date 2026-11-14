import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { defaults, evaluate } from './animation';
import { exampleLayers } from './example';
import { Icon } from './Icon';
import { CANVAS, DURATION, clamp, editLayerSpan, editSpan, newLayer } from './model';
import type { Edge, Layer } from './model';
import { formatTime, Timeline } from './Timeline';
import type { Selection } from './Timeline';
import { registry, templates } from './templates';
import './style.css';

const kinds = [['text', 'テキスト'], ['rectangle', '四角形'], ['ellipse', '円・楕円']] as const;
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
  const addMenu = useRef<HTMLDivElement>(null);
  const clock = useRef(time);
  const nextLayer = useRef(5);
  const layer = layers.find(item => item.id === selection?.layerId);
  const animation = layer?.animations.find(item => item.id === selection?.animationId);
  const template = animation && registry.get(animation.template);

  useEffect(() => {
    if (!playing) return;
    const began = performance.now();
    const offset = clock.current;
    let frame: number;
    function update(now: number) {
      const position = Math.min(DURATION, offset + (now - began) / 1000);
      clock.current = position;
      setTime(position);
      if (position < DURATION) frame = requestAnimationFrame(update);
      else setPlaying(false);
    }
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    if (!addOpen) return;
    function close(event: globalThis.PointerEvent) {
      if (!addMenu.current?.contains(event.target as Node)) setAddOpen(false);
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [addOpen]);

  function seek(position: number) {
    setPlaying(false);
    clock.current = position;
    setTime(position);
  }

  function openLayer(id: string) {
    setExpanded(current => new Set([...current, id]));
  }

  function addLayer(kind: Layer['kind']) {
    const item = newLayer(kind, nextLayer.current++);
    setLayers(current => [item, ...current]);
    setSelection({ layerId: item.id });
    setAddOpen(false);
  }

  function updateLayer(id: string, update: (item: Layer) => Layer) {
    setLayers(items => items.map(item => item.id === id ? update(item) : item));
  }

  function addAnimation(id: string) {
    if (!layer) return;
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
    if (!layer) return;
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

  return <main className="editor">
    <header className="app-header">
      <div className="brand"><span className="brand-icon"><Icon name="logo" size={22} /></span><h1>MV <em>Easy</em></h1></div>
      <span className="header-divider" />
      <span className="project-name">文字PVエディター</span>
      <div className="add-area" ref={addMenu} onKeyDown={event => { if (event.key === 'Escape') setAddOpen(false); }}>
        <button type="button" className="primary add-button" aria-expanded={addOpen}
          onClick={() => setAddOpen(open => !open)}><Icon name="plus" />追加<Icon name="down" size={13} /></button>
        {addOpen && <div className="add-menu">{kinds.map(([kind, label]) =>
          <button type="button" key={kind} onClick={() => addLayer(kind)}><Icon name={kind} />{label}</button>)}</div>}
      </div>
    </header>
    <div className="workspace">
      <aside className="library">
        <div className="panel-title"><Icon name="spark" size={17} /><h2>テンプレート</h2></div>
        <p>レイヤーを選んでアニメーションを追加</p>
        <div className="template-grid">{templates.map(item => <button type="button" key={item.id} disabled={!layer}
          className={`template-card ${item.tone}`} onClick={() => addAnimation(item.id)}>
          <span className="template-icon"><Icon name={item.icon} size={22} /></span><span>{item.label}</span>
        </button>)}</div>
      </aside>
      <section className="monitor" aria-label="プレビュー">
        <div className="monitor-head"><h2>プレビュー</h2><span>1920 × 1080</span></div>
        <div className="stage">
          <div className="canvas">
            {layers.slice().reverse().map(item => {
              const pose = evaluate(item, time, registry);
              if (pose.opacity === 0 || pose.scale === 0) return null;
              return <button type="button" key={item.id} aria-label={item.name}
                className={`canvas-object ${item.kind} ${!playing && layer?.id === item.id ? 'canvas-selected' : ''}`}
                style={{
                  left: `${pose.x / CANVAS.width * 100}%`, top: `${pose.y / CANVAS.height * 100}%`,
                  width: `${item.width / CANVAS.width * 100}%`, height: `${item.height / CANVAS.height * 100}%`,
                  fontSize: `${item.fontSize / CANVAS.width * 100}cqw`, opacity: pose.opacity,
                  transform: `translate(-50%, -50%) rotate(${pose.rotation}deg) scale(${pose.scale})`,
                  color: pose.color, backgroundColor: item.kind === 'text' ? 'transparent' : pose.color,
                }} onClick={() => setSelection({ layerId: item.id })}>{item.kind === 'text' && item.text}</button>;
            })}
          </div>
        </div>
        <div className="transport">
          <div className="timecode"><Icon name="clock" size={15} /><strong>{formatTime(time)}</strong><span>/ {formatTime(DURATION)}</span></div>
          <div className="transport-buttons">
            <button type="button" className="icon-button" aria-label="最初へ" onClick={() => seek(0)}><Icon name="first" /></button>
            <button type="button" className="primary play-button" aria-label={playing ? '一時停止' : '再生'}
              onClick={() => { if (!playing && clock.current >= DURATION) seek(0); setPlaying(!playing); }}>
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
              onClick={removeSelection}><Icon name="trash" size={17} /></button></div>
          {animation && template ? <div className="properties" key={animation.id}>
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
          </div> : <div className="properties" key={layer.id}>
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
          </div>}
        </> : <p>タイムラインかプレビューでレイヤーを選択してください。</p>}
      </aside>
    </div>
    <Timeline layers={layers} selection={selection} expanded={expanded} time={time}
      onSelect={setSelection} onSeek={seek} onEdit={edit} onToggle={id => setExpanded(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      })} />
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
