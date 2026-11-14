import { memo, useState } from 'react';
import { categories } from './animation';
import { templates } from './templates';
import { Icon } from './Icon';
import type { AnimationDensity } from './autoAnimation';

export const TemplateLibrary = memo(function TemplateLibrary({ kind, playing, onAdd, onAuto }: {
  kind?: string; playing: boolean; onAdd: (id: string) => void;
  onAuto: (density: AnimationDensity) => { added: number; affected: number } | undefined;
}) {
  const [open, setOpen] = useState<string | null>(categories[0]);
  const [search, setSearch] = useState('');
  const [density, setDensity] = useState<AnimationDensity>('normal');
  const [result, setResult] = useState('');
  const query = search.trim().normalize('NFKC').toLowerCase();
  const matches = templates.filter(item => item.label.normalize('NFKC').toLowerCase().includes(query));
  const cards = (items: typeof templates) => <div className="template-grid">{items.map(item => <button type="button"
    key={item.id} disabled={!kind || playing || (item.textOnly && kind !== 'text')}
    title={item.textOnly ? 'テキスト専用' : item.label}
    className={`template-card ${item.tone}`} onClick={() => onAdd(item.id)}>
    <span className="template-icon"><Icon name={item.icon} size={20} /></span><span>{item.label}</span>
  </button>)}</div>;
  return <aside className="library">
    <div className="panel-title"><Icon name="spark" size={17} /><h2>テンプレート</h2></div>
    {kind === 'text' && <div className="auto-animation">
      <label>アニメーション数<select value={density} disabled={playing}
        onChange={event => setDensity(event.target.value as AnimationDensity)}>
        <option value="low">少なめ</option><option value="normal">標準</option><option value="high">多め</option>
      </select></label>
      <button className="primary" type="button" disabled={playing} onClick={() => {
        const outcome = onAuto(density);
        if (outcome) setResult(outcome.added
          ? `${outcome.affected}クリップに${outcome.added}件追加しました。`
          : 'この設定で追加できる枠がありません。');
      }}>自動でアニメーションを適用</button>
      {result && <p role="status">{result}</p>}
    </div>}
    <input className="template-search" type="search" aria-label="テンプレート名で検索" placeholder="テンプレート名で検索"
      value={search} onChange={event => setSearch(event.target.value)} />
    {query ? (matches.length ? cards(matches) : <p>一致するテンプレートがありません。</p>) :
      <div className="template-folders">{['すべて', ...categories].map(category => <div key={category}>
        <button className="template-folder" type="button" aria-expanded={open === category}
          onClick={() => setOpen(open === category ? null : category)}>
          <Icon name={open === category ? 'down' : 'chevron'} size={14} />{category}
        </button>
        {open === category && cards(category === 'すべて' ? templates : templates.filter(item => item.category === category))}
      </div>)}</div>}
  </aside>;
});
