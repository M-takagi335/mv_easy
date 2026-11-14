import { useEffect, useId, useMemo, useState } from 'react';
import { defaults } from './animation';
import type { Template } from './animation';
import type { FontProvider } from './fonts';
import { CANVAS } from './model';
import type { Layer } from './model';
import { Scene } from './Scene';

const period = 2.4;
const length = 1.65;

export function TemplateSample({ template, fontProvider, kind, onClose }: {
  template: Template; fontProvider: FontProvider; kind?: string; onClose: () => void;
}) {
  const id = useId();
  const groups = useMemo((): Layer[][] => [[{
    id, name: template.label, kind: !template.textOnly && (kind === 'rectangle' || kind === 'ellipse') ? kind : 'text',
    text: '文字PV♫', x: CANVAS.width / 2, y: CANVAS.height / 2, width: 1350, height: 610,
    color: '#e6d5ff', fontSize: 260, rotation: 0, start: 0, end: period,
    animations: [{ id, template: template.id, start: 0, end: length, params: defaults(template) }],
  }]], [id, kind, template]);
  const [time, setTime] = useState(0);
  useEffect(() => {
    setTime(0);
    let frame = 0;
    let previous = -1;
    const start = performance.now();
    function tick(now: number) {
      const step = Math.floor(Math.max(0, now - start) * 0.03);
      if (step !== previous) {
        previous = step;
        setTime((step / 30) % period);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [template]);
  return <section className="template-sample" aria-label="動作プレビュー">
    <div><strong>{template.label}</strong><button type="button" onClick={onClose} aria-label="動作プレビューを閉じる">×</button></div>
    <div className="canvas template-sample-canvas" aria-hidden="true">
      <Scene groups={groups} time={time} fontProvider={fontProvider} />
    </div>
  </section>;
}
