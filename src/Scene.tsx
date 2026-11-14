import { evaluate, sampleTrails } from './animation';
import type { Pose } from './animation';
import { CANVAS } from './model';
import type { Layer } from './model';
import { registry } from './templates';
import { resolveTextFont } from './fonts';
import type { FontProvider } from './fonts';
import { AnimatedText } from './AnimatedText';
import type { ReactNode } from 'react';

type ContentProps = { className: string; style: React.CSSProperties; children: ReactNode };

export function Scene({ groups, time, fontProvider, renderObject }: {
  groups: Layer[][]; time: number; fontProvider: FontProvider;
  renderObject?: (item: Layer, pose: Pose, props: ContentProps) => ReactNode;
}) {
  return groups.flatMap(group => {
    const nextStarts = new Set(group.map(item => item.start));
    return group.filter(item => item.end !== time || !nextStarts.has(time));
  }).reverse().map(item => {
    const pose = evaluate(item, time, registry);
    const pastPoses = pose.trails ? sampleTrails(item, time, pose, registry) : [];
    if ((pose.opacity === 0 || pose.scale === 0) && pastPoses.length === 0) return null;
    const unit = (value: number) => `${value * 100 / CANVAS.width}cqw`;
    const visualFilters = (pose.filters ?? []).filter(filter =>
      filter.kind !== 'directional' || (filter.strength > 0 && (filter.x !== 0 || filter.y !== 0)));
    const filterId = (index: number) => `directional-${item.id}-${index}`;
    const filters = [
      pose.blur && `blur(${unit(pose.blur)})`,
      pose.hue && `hue-rotate(${pose.hue}deg)`,
      pose.glow && `drop-shadow(0 0 ${unit(pose.glow)} ${pose.color})`,
      pose.rgb && `drop-shadow(${unit(pose.rgb)} 0 0 #f03a6c) drop-shadow(${unit(-pose.rgb)} 0 0 #36cfff)`,
      ...visualFilters.map((filter, index) => {
        if (filter.kind === 'shadow') return `drop-shadow(${unit(filter.x)} ${unit(filter.y)} ${unit(filter.blur)} ${filter.color})`;
        if (filter.kind === 'directional') return `url("#${filterId(index)}")`;
        const value = filter.kind === 'blur' ? unit(filter.value)
          : filter.kind === 'hue-rotate' ? `${filter.value}deg` : filter.value;
        return `${filter.kind}(${value})`;
      }),
    ].filter(Boolean).join(' ');
    const typography = item.kind === 'text' ? resolveTextFont(item, fontProvider) : undefined;
    const placement = (part: Pose) => ({
      left: `${part.x / CANVAS.width * 100}%`, top: `${part.y / CANVAS.height * 100}%`,
      width: `${item.width / CANVAS.width * 100}%`, height: `${item.height / CANVAS.height * 100}%`,
      fontSize: unit(item.fontSize), opacity: part.opacity,
      transform: `translate(-50%, -50%) rotate(${part.rotation}deg) skewX(${part.skew ?? 0}deg) scale(${part.scale * (part.scaleX ?? 1)}, ${part.scale * (part.scaleY ?? 1)})${part.tiltX || part.tiltY ? ` perspective(${unit(2400)}) rotateX(${part.tiltX ?? 0}deg) rotateY(${part.tiltY ?? 0}deg)` : ''}`,
      color: part.color,
    });
    const textAt = (part: Pose) => part.glyphs ? <AnimatedText text={item.text} effects={part.glyphs} /> : item.text;
    const lines = pose.lines?.map(line => {
      const spacing = Math.max(2, line.spacing);
      const color = line.color + Math.round(line.opacity * 255).toString(16).padStart(2, '0');
      if (line.bands) {
        const stops = line.bands.map((edge, index) => index % 2 === 0
          ? `transparent ${unit(edge)}, ${color} ${unit(edge)}`
          : `${color} ${unit(edge)}, transparent ${unit(edge)}`);
        return `repeating-linear-gradient(0deg, transparent 0, ${stops.join(', ')}, transparent ${unit(spacing)})`;
      }
      return `repeating-linear-gradient(0deg, transparent 0 ${unit(spacing - 1)}, ${color} ${unit(spacing - 1)} ${unit(spacing)})`;
    }).join(', ');
    const content = (part: Pose): ContentProps => ({
      className: `canvas-content ${item.kind}`,
      style: typography ? { fontFamily: typography.fontFamily, fontWeight: typography.fontWeight,
        fontStyle: typography.fontStyle } : { backgroundColor: part.color },
      children: item.kind === 'text' && textAt(part),
    });
    const props = content(pose);
    Object.assign(props.style, {
      filter: filters || undefined,
      backgroundImage: lines,
      backgroundPosition: pose.lines?.map(line => `0 ${unit(line.offset)}`).join(', '),
      clipPath: pose.reveal ?? (pose.slice ? `inset(${Math.min(pose.slice, 45)}% 0 0)` : undefined),
    });
    return <div key={item.id}>
      {visualFilters.map((filter, index) => {
        if (filter.kind !== 'directional') return null;
        const dx = filter.x / item.width;
        const dy = filter.y / item.height;
        const taps = [0.2, 0.4, 0.6, 0.8, 1];
        return <svg key={index} xmlns="http://www.w3.org/2000/svg" width="0" height="0" className="effect-definitions" aria-hidden="true">
          <filter id={filterId(index)} primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB"
            x={-0.2 - Math.abs(dx)} y={-0.2 - Math.abs(dy)} width={1.4 + 2 * Math.abs(dx)} height={1.4 + 2 * Math.abs(dy)}>
            <feComponentTransfer in="SourceGraphic" result="faint"><feFuncA type="linear" slope={filter.strength / 4} /></feComponentTransfer>
            {taps.map(tap => <feOffset key={tap} in="faint" dx={dx * tap} dy={dy * tap} result={`tap${tap}`} />)}
            <feMerge>
              {taps.slice().reverse().map(tap => <feMergeNode key={tap} in={`tap${tap}`} />)}
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </svg>;
      })}
      {pastPoses.map((past, index) =>
        <div className="canvas-object" aria-hidden="true" key={index} style={placement(past)}>
          <div {...content(past)} className={`canvas-content trail-copy ${item.kind}`} />
        </div>)}
      <div className="canvas-object" style={placement(pose)}>
        {renderObject ? renderObject(item, pose, props) : <div {...props} />}
      </div>
    </div>;
  });
}
