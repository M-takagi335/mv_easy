import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import { STEP, clamp, groupLayers, trackId } from './model';
import type { MusicClip } from './music';
import type { Edge, Layer, Reorder, Span } from './model';
import { registry } from './templates';

export type Selection = { layerId: string; animationId?: string };
type TimelineProps = {
  layers: Layer[];
  selection: Selection | null;
  expanded: Set<string>;
  time: number;
  duration: number;
  musicClips: MusicClip[];
  peaks?: Float32Array;
  selectedMusicId?: string;
  onSelectMusic: (id?: string) => void;
  onEditMusic: (edge: Edge, delta: number, original: MusicClip) => void;
  playing: boolean;
  onReorder: (source: Selection, target: Reorder) => void;
  onToggle: (id: string) => void;
  onSelect: (selection: Selection) => void;
  onSeek: (time: number) => void;
  onEditCommit: (original: Layer) => void;
  onRename: (id: string, name: string) => void;
  onEdit: (selection: Selection, edge: Edge, delta: number, original?: Layer) => void;
};

export function formatTime(time: number) {
  const centiseconds = Math.round(time * 100);
  return String(Math.floor(centiseconds / 6000)).padStart(2, '0') + ':'
    + ((centiseconds % 6000) / 100).toFixed(2).padStart(5, '0');
}

export function Timeline({ layers, selection, expanded, time, duration, musicClips, peaks, selectedMusicId, onSelectMusic, onEditMusic,
  playing, onReorder, onToggle, onSelect, onSeek, onEdit, onEditCommit, onRename }: TimelineProps) {
  const [drop, setDrop] = useState<Reorder | null>(null);
  const groups = useMemo(() => groupLayers(layers), [layers]);
  const [renaming, setRenaming] = useState<{ id: string; name: string }>();
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const timelineRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeline = timelineRef.current!;
    const scroll = scrollRef.current!;
    const ruler = rulerRef.current!;
    function wheel(event: WheelEvent) {
      if (event.ctrlKey) {
        event.preventDefault();
        const mode = event.deltaMode;
        const delta = event.deltaY || event.deltaX;
        const pixels = delta * (mode === 1 ? 16 : mode === 2 ? scroll.clientWidth : 1);
        scroll.scrollLeft = clamp(scroll.scrollLeft + pixels, 0, scroll.scrollWidth - scroll.clientWidth);
        return;
      }
      if (!scroll.contains(event.target as Node)) return;
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
      if (event.target instanceof Element && event.target.closest('.layer-column, .layer-label, .empty-track')) return;
      const bounds = ruler.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right) return;
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1);
      const next = clamp(zoomRef.current * Math.exp(-pixels * 0.002), 1, 8);
      if (next === zoomRef.current) return;
      const fraction = (event.clientX - bounds.left) / bounds.width;
      zoomRef.current = next;
      flushSync(() => setZoom(next));
      const resized = ruler.getBoundingClientRect();
      scroll.scrollLeft += resized.left + fraction * resized.width - event.clientX;
    }
    timeline.addEventListener('wheel', wheel, { passive: false });
    return () => timeline.removeEventListener('wheel', wheel);
  }, []);
  const waveform = useMemo(() => peaks && Array.from(peaks, (peak, i) => {
    const amplitude = Math.max(0.008, peak);
    return `M${i + 0.5} ${1 - amplitude}v${amplitude * 2}`;
  }).join(''), [peaks]);

  function barStyle(span: Span): CSSProperties {
    return { left: `${100 * span.start / duration}%`, width: `${100 * (span.end - span.start) / duration}%` };
  }
  const orderDrag = useRef<{ source: Selection; pointer: number; y: number; moved: boolean; target: Reorder | null } | null>(null);
  const suppressClick = useRef(false);

  function orderEvents(source: Selection, selectedLayerId = source.layerId) {
    return {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        suppressClick.current = false;
        if (playing || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        orderDrag.current = { source, pointer: event.pointerId, y: event.clientY, moved: false, target: null };
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const drag = orderDrag.current;
        if (!drag || drag.pointer !== event.pointerId || playing) return;
        if (!drag.moved && Math.abs(event.clientY - drag.y) < 4) return;
        drag.moved = true;
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        const row = source.animationId === undefined
          ? hit?.closest<HTMLElement>('[data-layer]')
          : hit?.closest<HTMLElement>('[data-animation]');
        const id = source.animationId === undefined ? row?.dataset.layer : row?.dataset.animation;
        const owner = layers.find(item => item.id === source.layerId);
        const eligible = source.animationId === undefined ||
          (owner && row?.closest<HTMLElement>('[data-layer]')?.dataset.layer === trackId(owner));
        const bounds = row?.getBoundingClientRect();
        drag.target = eligible && id && id !== (source.animationId ?? source.layerId) && bounds
          ? { id, after: event.clientY >= bounds.top + bounds.height / 2 } : null;
        setDrop(drag.target);
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        const drag = orderDrag.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        suppressClick.current = drag.moved;
        if (!playing && drag.target) {
          onSelect({ ...drag.source, layerId: selectedLayerId });
          onReorder(drag.source, drag.target);
        }
        orderDrag.current = null;
        setDrop(null);
      },
      onLostPointerCapture() {
        orderDrag.current = null;
        setDrop(null);
      },
      onClick(event: React.MouseEvent<HTMLButtonElement>) {
        if (event.detail !== 0 && suppressClick.current) return;
        onSelect({ ...source, layerId: selectedLayerId });
        if (source.animationId === undefined) onToggle(selectedLayerId);
      },
    };
  }

  const dropClass = (id: string) => !playing && drop?.id === id ? (drop.after ? 'drop-after' : 'drop-before') : '';

  function drag(event: PointerEvent<HTMLButtonElement>, target: Selection, edge: Edge, original: Layer) {
    dragBar(event, delta => onEdit(target, edge, delta, original), () => onSelect(target),
      !target.animationId ? () => onEditCommit(original) : undefined);
  }

  function dragBar(event: PointerEvent<HTMLButtonElement>, update: (delta: number) => void, select: () => void, commit?: () => void) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (playing) return;
    const handle = event.currentTarget;
    const width = handle.closest('.track')!.getBoundingClientRect().width;
    const startX = event.clientX;
    let delta = 0;
    handle.setPointerCapture(event.pointerId);
    function move(moveEvent: globalThis.PointerEvent) {
      if (moveEvent.pointerId === event.pointerId) {
        delta = (moveEvent.clientX - startX) * duration / width;
        update(delta);
      }
    }
    const finish = () => {
      handle.removeEventListener('pointermove', move);
      if (Math.abs(delta) >= STEP / 2) commit?.();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('lostpointercapture', finish, { once: true });
    select();
  }

  function key(event: KeyboardEvent, target: Selection, edge: Edge) {
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey ||
        !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (playing) return;
    onSelect(target);
    onEdit(target, edge, event.key === 'ArrowLeft' ? -STEP : STEP);
  }

  function bar(layer: Layer, span: Span, target: Selection, caption: string, tone: string, content: ReactNode, timing = span) {
    const active = selection?.layerId === target.layerId && selection?.animationId === target.animationId;
    return <div className={`clip ${tone} ${active ? 'selected-clip' : ''}`} style={barStyle(span)}
      title={`${formatTime(timing.start)} — ${formatTime(timing.end)}`}>
      <button type="button" className="clip-body" aria-label={caption} aria-pressed={active} title={caption}
        onPointerDown={event => drag(event, target, 'move', layer)}
        onClick={() => onSelect(target)}>
        {content}
      </button>
      {(['start', 'end'] as const).map(edge => <button key={edge} type="button"
        className={`clip-edge ${edge}`} aria-label={`${caption}の${edge === 'start' ? '開始' : '終了'}端点`}
        onPointerDown={event => drag(event, target, edge, layer)}
        onKeyDown={event => key(event, target, edge)} />)}
    </div>;
  }

  function scrub(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubPosition(event);
  }

  function scrubPosition(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    onSeek(clamp((event.clientX - bounds.left) * duration / bounds.width, 0, duration));
  }

  return <section ref={timelineRef} className="timeline" aria-label="タイムライン">
    <div className="timeline-head">
      <h2><Icon name="panel" size={17} /> タイムライン</h2>
      <div className="timeline-tools">
        <span className="shortcut">端点へ移動 <kbd>Alt</kbd> + <kbd>←</kbd> <kbd>→</kbd></span>
        <label>ズーム <input aria-label="タイムラインのズーム" type="range" min="1" max="8" step="0.01"
          value={zoom} onChange={event => { zoomRef.current = event.target.valueAsNumber; setZoom(zoomRef.current); }} />
          <span>{Math.round(zoom * 100)}%</span></label>
      </div>
    </div>
    <div className="tracks-scroll" ref={scrollRef}>
      <div className="tracks-area" style={{ width: `${zoom * 100}%` }}>
        <div className="ruler-row">
          <div className="layer-column">レイヤー <span>{groups.length}</span></div>
          <div ref={rulerRef} className="ruler" role="slider" tabIndex={0} aria-label="再生位置" aria-valuemin={0} aria-valuemax={duration}
            aria-valuenow={Number(time.toFixed(2))} onPointerDown={scrub}
            onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubPosition(event); }}
            onKeyDown={event => {
              if (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const positions = { ArrowLeft: time - STEP, ArrowRight: time + STEP, Home: 0, End: duration };
              onSeek(clamp(positions[event.key as keyof typeof positions], 0, duration));
            }}>
            {Array.from({ length: 6 }, (_, index) => <span key={index} style={{ left: `${index * 20}%` }}>
              {formatTime(index * duration / 5).slice(0, -3)}
            </span>)}
            <div className="ruler-marker" style={{ left: `${100 * time / duration}%` }} aria-hidden="true" />
          </div>
        </div>
        {musicClips.length > 0 && <div className="track-row music-row">
          <div className="layer-label"><button type="button" className="layer-name" onClick={() => onSelectMusic(musicClips[0].id)}>♫ 音楽</button></div>
          <div className="track" onPointerDown={scrub} onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubPosition(event);
          }}>
            {musicClips.map(music => <div key={music.id} className={`clip music-clip ${selectedMusicId === music.id ? 'selected-clip' : ''}`} style={barStyle(music)}>
              {waveform && peaks && <svg className="waveform" aria-hidden="true" preserveAspectRatio="none"
                viewBox={`${music.inPoint / music.asset.duration * peaks.length} 0 ${(music.end - music.start) / music.asset.duration * peaks.length} 2`}>
                <path d={waveform} vectorEffect="non-scaling-stroke" />
              </svg>}
              <button type="button" className="clip-body" aria-pressed={selectedMusicId === music.id} title={music.asset.name}
                onClick={() => onSelectMusic(music.id)} onPointerDown={event => dragBar(event, delta => onEditMusic('move', delta, music), () => onSelectMusic(music.id))}>
                {music.muted ? '消音 · ' : ''}{music.asset.name}{!peaks && '（再リンクが必要）'}
              </button>
              {(['start', 'end'] as const).map(edge => <button key={edge} type="button" className={`clip-edge ${edge}`}
                aria-label={`音楽の${edge === 'start' ? '開始' : '終了'}端点`}
                onPointerDown={event => dragBar(event, delta => onEditMusic(edge, delta, music), () => onSelectMusic(music.id))}
                onKeyDown={event => {
                  if (playing || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey ||
                      !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                  event.preventDefault();
                  onSelectMusic(music.id);
                  onEditMusic(edge, event.key === 'ArrowLeft' ? -STEP : STEP, music);
                }} />)}
            </div>)}
          </div>
        </div>}
        {groups.map(group => {
          const layer = group.find(item => item.id === selection?.layerId) ?? group[0];
          const id = trackId(layer);
          const open = expanded.has(layer.id);
          const active = selection?.layerId === layer.id;
          return <div key={id} data-layer={id} className={dropClass(id)}>
            <div className={`track-row ${active ? 'active-row' : ''}`}>
              <div className="layer-label">
                <button type="button" className="icon-button disclosure" aria-label={`${layer.name}のアニメーション`}
                  aria-expanded={open} onClick={() => onToggle(layer.id)}>
                  <Icon name={open ? 'down' : 'chevron'} size={13} />
                </button>
                {renaming?.id === id ? <input className="layer-rename" aria-label="レイヤー名" autoFocus
                  value={renaming.name} onFocus={event => event.currentTarget.select()}
                  onChange={event => setRenaming({ id, name: event.target.value })}
                  onBlur={() => setRenaming(undefined)}
                  onKeyDown={event => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === 'Enter' || event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      if (event.key === 'Enter' && renaming.name.trim()) onRename(id, renaming.name.trim());
                      setRenaming(undefined);
                    }
                  }} /> : <button type="button" className="layer-name reorder-label"
                  title={layer.name} {...orderEvents({ layerId: id }, layer.id)}
                  onDoubleClick={() => { if (!playing) setRenaming({ id, name: layer.name }); }}>
                  <Icon name={layer.kind} size={15} /> <span>{layer.name}</span>
                </button>}
              </div>
              <div className="track" onPointerDown={scrub} onPointerMove={event => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubPosition(event);
              }}>
                {group.map(clip => <Fragment key={clip.id}>{bar(clip, clip, { layerId: clip.id },
                  clip.kind === 'text' ? clip.text || clip.name : clip.name, 'object-clip', clip.kind === 'text' ? clip.text || clip.name : clip.name)}</Fragment>)}
              </div>
            </div>
            {open && layer.animations.map(animation => {
              const visible = { start: Math.max(layer.start, animation.start), end: Math.min(layer.end, animation.end) };
              if (visible.end < visible.start || (visible.end === visible.start && animation.end !== animation.start)) return null;
              const template = registry.get(animation.template)!;
              const selected = active && selection?.animationId === animation.id;
              return <div key={animation.id} data-animation={animation.id}
                className={`track-row animation-row ${selected ? 'active-row' : ''} ${dropClass(animation.id)}`}>
                <div className="layer-label">
                  <button type="button" className={`layer-name reorder-label ${template.tone}`} aria-pressed={selected}
                    title="上下ドラッグで合成順を変更" {...orderEvents({ layerId: layer.id, animationId: animation.id })}>
                    <Icon name={template.icon} size={15} /> <span>{template.label}</span>
                  </button>
                </div>
                <div className="track" onPointerDown={scrub} onPointerMove={event => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubPosition(event);
                }}>
                  {bar(layer, visible, { layerId: layer.id, animationId: animation.id }, template.label,
                    template.tone, <>{template.label}</>, animation)}
                </div>
              </div>;
            })}
            {open && !layer.animations.length && <div className="track-row animation-row">
              <div className="empty-track">テンプレートで追加</div><div className="track" />
            </div>}
          </div>;
        })}
        {!layers.length && <p className="empty-timeline">＋追加から最初のレイヤーを作成できます。</p>}
        <div className="playhead-area" aria-hidden="true"><div className="playhead" style={{ left: `${100 * time / duration}%` }} /></div>
      </div>
    </div>
  </section>;
}
