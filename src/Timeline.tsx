import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import { DURATION, STEP, clamp } from './model';
import type { Edge, Layer, Span } from './model';
import { registry } from './templates';

export type Selection = { layerId: string; animationId?: string };
type TimelineProps = {
  layers: Layer[];
  selection: Selection | null;
  expanded: Set<string>;
  time: number;
  onToggle: (id: string) => void;
  onSelect: (selection: Selection) => void;
  onSeek: (time: number) => void;
  onEdit: (selection: Selection, edge: Edge, delta: number, original?: Layer) => void;
};

export function formatTime(time: number) {
  return '00:' + time.toFixed(2).padStart(5, '0');
}

function barStyle(span: Span): CSSProperties {
  return { left: `${100 * span.start / DURATION}%`, width: `${100 * (span.end - span.start) / DURATION}%` };
}

export function Timeline({ layers, selection, expanded, time, onToggle, onSelect, onSeek, onEdit }: TimelineProps) {
  function drag(event: PointerEvent<HTMLButtonElement>, target: Selection, edge: Edge, original: Layer) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const handle = event.currentTarget;
    const width = handle.closest('.track')!.getBoundingClientRect().width;
    const startX = event.clientX;
    handle.setPointerCapture(event.pointerId);
    function move(moveEvent: globalThis.PointerEvent) {
      if (moveEvent.pointerId === event.pointerId) {
        onEdit(target, edge, (moveEvent.clientX - startX) * DURATION / width, original);
      }
    }
    const finish = () => handle.removeEventListener('pointermove', move);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('lostpointercapture', finish, { once: true });
    onSelect(target);
  }

  function key(event: KeyboardEvent, target: Selection, edge: Edge) {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(target);
    onEdit(target, edge, event.key === 'ArrowLeft' ? -STEP : STEP);
  }

  function bar(layer: Layer, span: Span, target: Selection, caption: string, tone: string, content: ReactNode) {
    const active = selection?.layerId === target.layerId && selection?.animationId === target.animationId;
    return <div className={`clip ${tone} ${active ? 'selected-clip' : ''}`} style={barStyle(span)}>
      <button type="button" className="clip-body" aria-label={caption} aria-pressed={active} title={caption}
        onPointerDown={event => drag(event, target, 'move', layer)}
        onClick={() => onSelect(target)} onKeyDown={event => key(event, target, event.shiftKey ? 'start' : 'end')}>
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
    onSeek(clamp((event.clientX - bounds.left) * DURATION / bounds.width, 0, DURATION));
  }

  return <section className="timeline" aria-label="タイムライン">
    <div className="timeline-head">
      <h2><Icon name="panel" size={17} /> タイムライン</h2>
      <span className="shortcut">端点を選択 <kbd>Alt</kbd> + <kbd>←</kbd> <kbd>→</kbd></span>
    </div>
    <div className="tracks-scroll">
      <div className="tracks-area">
        <div className="ruler-row">
          <div className="layer-column">レイヤー <span>{layers.length}</span></div>
          <div className="ruler" role="slider" tabIndex={0} aria-label="再生位置" aria-valuemin={0} aria-valuemax={DURATION}
            aria-valuenow={Number(time.toFixed(2))} onPointerDown={scrub}
            onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubPosition(event); }}
            onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const positions = { ArrowLeft: time - STEP, ArrowRight: time + STEP, Home: 0, End: DURATION };
              onSeek(clamp(positions[event.key as keyof typeof positions], 0, DURATION));
            }}>
            {Array.from({ length: 6 }, (_, index) => <span key={index} style={{ left: `${index * 20}%` }}>
              00:{String(index * 3).padStart(2, '0')}
            </span>)}
          </div>
        </div>
        {layers.map(layer => {
          const open = expanded.has(layer.id);
          const active = selection?.layerId === layer.id;
          return <div key={layer.id}>
            <div className={`track-row ${active ? 'active-row' : ''}`}>
              <div className="layer-label">
                <button type="button" className="icon-button disclosure" aria-label={`${layer.name}のアニメーション`}
                  aria-expanded={open} onClick={() => onToggle(layer.id)}>
                  <Icon name={open ? 'down' : 'chevron'} size={13} />
                </button>
                <button type="button" className="layer-name" onClick={() => onSelect({ layerId: layer.id })}>
                  <Icon name={layer.kind} size={15} /> <span>{layer.name}</span>
                </button>
              </div>
              <div className="track" onPointerDown={scrub} onPointerMove={event => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubPosition(event);
              }}>
                {bar(layer, layer, { layerId: layer.id }, layer.name, 'object-clip', <>{layer.name}</>)}
              </div>
            </div>
            {open && layer.animations.map(animation => {
              const template = registry.get(animation.template)!;
              return <div key={animation.id} className="track-row animation-row">
                <div className="layer-label">
                  <button type="button" className={`layer-name ${template.tone}`}
                    onClick={() => onSelect({ layerId: layer.id, animationId: animation.id })}>
                    <Icon name={template.icon} size={15} /> <span>{template.label}</span>
                  </button>
                </div>
                <div className="track" onPointerDown={scrub} onPointerMove={event => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubPosition(event);
                }}>
                  {bar(layer, animation, { layerId: layer.id, animationId: animation.id }, template.label,
                    template.tone, <>{template.label}</>)}
                </div>
              </div>;
            })}
            {open && !layer.animations.length && <div className="track-row animation-row">
              <div className="empty-track">テンプレートで追加</div><div className="track" />
            </div>}
          </div>;
        })}
        {!layers.length && <p className="empty-timeline">＋追加から最初のレイヤーを作成できます。</p>}
        <div className="playhead-area" aria-hidden="true"><div className="playhead" style={{ left: `${100 * time / DURATION}%` }} /></div>
      </div>
    </div>
  </section>;
}
