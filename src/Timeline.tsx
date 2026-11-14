import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import { STEP, animationTimelineSpan, clamp, groupLayers, trackId } from './model';
import type { MusicClip } from './music';
import type { Edge, Layer, Reorder, Span } from './model';
import { registry } from './templates';
import { selectionKey } from './selection';
import type { Selection } from './selection';
import type { Playhead } from './playhead';

export type { Selection } from './selection';
type TimelineProps = {
  layers: Layer[];
  selection: Selection | null;
  selectedItems: Selection[];
  expanded: Set<string>;
  playhead: Playhead;
  duration: number;
  musicClips: MusicClip[];
  peaks?: Float32Array;
  onSelectMusic: (id?: string) => void;
  onEditMusic: (edge: Edge, delta: number, original: MusicClip) => void;
  playing: boolean;
  onReorder: (source: Selection, target: Reorder) => void;
  onToggle: (id: string) => void;
  onSelect: (selection: Selection, additive?: boolean) => void;
  onSeek: (time: number) => void;
  onEditStart: (target: Selection, edge: Edge) => void;
  onEditFinish: (cancel?: boolean) => void;
  onRename: (id: string, name: string) => void;
  onEdit: (selection: Selection, edge: Edge, delta: number, original?: Layer) => void;
};

export function formatTime(time: number) {
  const centiseconds = Math.round(time * 100);
  return String(Math.floor(centiseconds / 6000)).padStart(2, '0') + ':'
    + ((centiseconds % 6000) / 100).toFixed(2).padStart(5, '0');
}

export function Timeline({ layers, selection, selectedItems, expanded, playhead, duration, musicClips, peaks, onSelectMusic, onEditMusic,
  playing, onReorder, onToggle, onSelect, onSeek, onEdit, onEditStart, onEditFinish, onRename }: TimelineProps) {
  const [drop, setDrop] = useState<Reorder | null>(null);
  const dragClick = useRef(false);
  const stopDrag = useRef<(() => void) | null>(null);
  const selectedKeys = new Set(selectedItems.map(selectionKey));
  useEffect(() => () => stopDrag.current?.(), []);
  const groups = useMemo(() => groupLayers(layers), [layers]);
  const [renaming, setRenaming] = useState<{ id: string; name: string }>();
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const timelineRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const previousAnimationIds = useRef<Set<string>>(new Set());

  useLayoutEffect(() => {
    const ruler = rulerRef.current!;
    const marker = markerRef.current!;
    const line = playheadRef.current!;
    const update = () => {
      const time = playhead.read();
      const left = `${100 * time / duration}%`;
      marker.style.left = line.style.left = left;
      ruler.setAttribute('aria-valuenow', String(Number(time.toFixed(2))));
    };
    update();
    return playhead.subscribe(update);
  }, [playhead, duration]);

  useEffect(() => {
    const ids = new Set(layers.flatMap(layer => layer.animations.map(animation => animation.id)));
    const selected = selection?.animationId;
    if (selected && !previousAnimationIds.current.has(selected)) {
      scrollRef.current?.querySelector('.animation-row .selected-clip')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    previousAnimationIds.current = ids;
  }, [layers, selection?.animationId]);

  useEffect(() => {
    const timeline = timelineRef.current!;
    const scroll = scrollRef.current!;
    const ruler = rulerRef.current!;
    function wheel(event: WheelEvent) {
      const mode = event.deltaMode;
      if (!event.ctrlKey) {
        if (!scroll.contains(event.target as Node) || event.shiftKey ||
            Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
        if (event.target instanceof Element &&
            event.target.closest('.layer-column, .layer-label, .empty-track, .empty-timeline')) return;
        event.preventDefault();
        scroll.scrollLeft += event.deltaY * (mode === 1 ? 16 : mode === 2 ? scroll.clientWidth : 1);
        return;
      }
      event.preventDefault();
      const pixels = event.deltaY * (mode === 1 ? 16 : mode === 2 ? scroll.clientHeight : 1);
      const next = clamp(zoomRef.current * Math.exp(-pixels * 0.002), 1, 8);
      if (next === zoomRef.current) return;
      const bounds = ruler.getBoundingClientRect();
      if (!bounds.width) return;
      const labelRight = ruler.previousElementSibling?.getBoundingClientRect().right ?? bounds.left;
      const viewport = scroll.getBoundingClientRect();
      const left = Math.max(bounds.left, labelRight);
      const right = Math.min(bounds.right, viewport.left + scroll.clientWidth);
      const anchor = clamp(event.clientX, left, Math.max(left, right));
      const fraction = (anchor - bounds.left) / bounds.width;
      zoomRef.current = next;
      flushSync(() => setZoom(next));
      const resized = ruler.getBoundingClientRect();
      scroll.scrollLeft += resized.left + fraction * resized.width - anchor;
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
    dragBar(event, delta => onEdit(target, edge, delta, original), target, edge);
  }

  function dragBar(event: PointerEvent<HTMLButtonElement>, update: (delta: number) => void, target: Selection, edge: Edge) {
    if (event.button !== 0) return;
    event.stopPropagation();
    dragClick.current = false;
    if (playing || stopDrag.current) return;
    if (event.ctrlKey || event.shiftKey) return;
    const handle = event.currentTarget;
    handle.focus({ preventScroll: true });
    const track = handle.closest('.track')!;
    const initialBounds = track.getBoundingClientRect();
    const start = (event.clientX - initialBounds.left) * duration / initialBounds.width;
    handle.setPointerCapture(event.pointerId);
    let dragged = false;
    function move(moveEvent: globalThis.PointerEvent) {
      if (moveEvent.pointerId === event.pointerId) {
        if (!dragged && Math.abs(moveEvent.clientX - event.clientX) < 3) return;
        if (!dragged) onEditStart(target, edge);
        dragged = true;
        dragClick.current = true;
        const bounds = track.getBoundingClientRect();
        const delta = (moveEvent.clientX - bounds.left) * duration / bounds.width - start;
        update(delta);
      }
    }
    let cancelled = false;
    const cancel = () => { cancelled = true; };
    function cancelOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || !handle.hasPointerCapture(pointerId)) return;
      event.preventDefault();
      cancelled = true;
      handle.releasePointerCapture(pointerId);
    }
    const pointerId = event.pointerId;
    const finish = () => {
      stopDrag.current = null;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointercancel', cancel);
      handle.removeEventListener('lostpointercapture', finish);
      window.removeEventListener('keydown', cancelOnEscape);
      if (dragged) onEditFinish(cancelled);
    };
    stopDrag.current = () => { cancel(); finish(); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', cancelOnEscape);
    handle.addEventListener('lostpointercapture', finish, { once: true });
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

  function bar(layer: Layer, span: Span, target: Selection, caption: string, tone: string, content: ReactNode, timing = span, open?: boolean) {
    const active = selectedKeys.has(selectionKey(target));
    const objectBar = target.animationId === undefined;
    return <div className={`clip ${tone} ${active ? 'selected-clip' : ''}`} style={barStyle(span)}
      title={`${formatTime(timing.start)} — ${formatTime(timing.end)}`}>
      <button type="button" className="clip-body" aria-label={caption} aria-pressed={active} title={caption}
        aria-expanded={open}
        onPointerDown={event => drag(event, target, 'move', layer)}
        onDoubleClick={objectBar ? () => {
          if (playing) return;
          onSelect(target);
          onToggle(layer.id);
        } : undefined}
        onClick={event => { if (!dragClick.current) onSelect(target, event.ctrlKey || event.shiftKey); }}>
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
            onPointerDown={scrub}
            onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubPosition(event); }}
            onKeyDown={event => {
              if (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
              if (!['Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              onSeek(event.key === 'Home' ? 0 : duration);
            }}>
            {Array.from({ length: 6 }, (_, index) => <span key={index} style={{ left: `${index * 20}%` }}>
              {formatTime(index * duration / 5).slice(0, -3)}
            </span>)}
            <div className="ruler-marker" ref={markerRef} aria-hidden="true" />
          </div>
        </div>
        {musicClips.length > 0 && <div className="track-row music-row">
          <div className="layer-label"><button type="button" className="layer-name" onClick={() => onSelectMusic(musicClips[0].id)}>♫ 音楽</button></div>
          <div className="track" onPointerDown={scrub} onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubPosition(event);
          }}>
            {musicClips.map(music => <div key={music.id} className={`clip music-clip ${selectedKeys.has(music.id!) ? 'selected-clip' : ''}`} style={barStyle(music)}>
              {waveform && peaks && <svg className="waveform" aria-hidden="true" preserveAspectRatio="none"
                viewBox={`${music.inPoint / music.asset.duration * peaks.length} 0 ${(music.end - music.start) / music.asset.duration * peaks.length} 2`}>
                <path d={waveform} vectorEffect="non-scaling-stroke" />
              </svg>}
              <button type="button" className="clip-body" aria-pressed={selectedKeys.has(music.id!)} title={music.asset.name}
                onClick={event => { if (!dragClick.current) onSelect({ layerId: music.id! }, event.ctrlKey || event.shiftKey); }}
                onPointerDown={event => dragBar(event, delta => onEditMusic('move', delta, music), { layerId: music.id! }, 'move')}>
                {music.muted ? '消音 · ' : ''}{music.asset.name}{!peaks && '（再リンクが必要）'}
              </button>
              {(['start', 'end'] as const).map(edge => <button key={edge} type="button" className={`clip-edge ${edge}`}
                aria-label={`音楽の${edge === 'start' ? '開始' : '終了'}端点`}
                onPointerDown={event => dragBar(event, delta => onEditMusic(edge, delta, music), { layerId: music.id! }, edge)}
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
                  aria-expanded={open} disabled={playing} onClick={() => onToggle(layer.id)}>
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
                  clip.kind === 'text' ? clip.text || clip.name : clip.name, 'object-clip',
                  clip.kind === 'text' ? clip.text || clip.name : clip.name, clip, clip.id === layer.id && open)}</Fragment>)}
              </div>
            </div>
            {open && layer.animations.map(animation => {
              const timing = animationTimelineSpan(layer, animation);
              const span = {
                start: clamp(timing.start, 0, duration), end: clamp(timing.end, 0, duration),
              };
              const template = registry.get(animation.template);
              const outside = timing.start < layer.start || timing.end > layer.end;
              const label = template?.label ?? animation.template;
              const selected = selectedKeys.has(selectionKey({ layerId: layer.id, animationId: animation.id }));
              return <div key={animation.id} data-animation={animation.id}
                className={`track-row animation-row ${selected ? 'active-row' : ''} ${dropClass(animation.id)}`}>
                <div className="layer-label">
                  <button type="button" className={`layer-name reorder-label ${template?.tone ?? 'violet'}`} aria-pressed={selected}
                    title="上下ドラッグで合成順を変更" {...orderEvents({ layerId: layer.id, animationId: animation.id })}>
                    <Icon name={template?.icon ?? 'spark'} size={15} /> <span>{label}{outside && '（範囲外を含む）'}{!template && '（未対応）'}</span>
                  </button>
                </div>
                <div className="track" onPointerDown={scrub} onPointerMove={event => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubPosition(event);
                }}>
                  {bar(layer, span, { layerId: layer.id, animationId: animation.id }, label,
                    `animation-clip ${template?.tone ?? 'violet'} ${outside ? 'outside-clip' : ''} ${span.start >= duration ? 'at-end' : ''}`,
                    label, timing)}
                </div>
              </div>;
            })}
            {open && !layer.animations.length && <div className="track-row animation-row">
              <div className="empty-track">テンプレートで追加</div><div className="track" />
            </div>}
          </div>;
        })}
        {!layers.length && <p className="empty-timeline">＋追加から最初のレイヤーを作成できます。</p>}
        <div className="playhead-area" aria-hidden="true"><div className="playhead" ref={playheadRef} /></div>
      </div>
    </div>
  </section>;
}
