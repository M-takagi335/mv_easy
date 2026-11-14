import { memo, useState } from 'react';
import { categories } from './animation';
import { templates } from './templates';
import { Icon } from './Icon';
import type { AnimationDensity } from './autoAnimation';
import { RANDOM_BATCH_LIMIT } from './randomAnimation';
import type { RandomGenre } from './randomAnimation';

export const TemplateLibrary = memo(function TemplateLibrary({ kind, playing, onAdd, onAuto, targetName, onRandom }: {
  kind?: string; playing: boolean; onAdd: (id: string) => void;
  onAuto: (density: AnimationDensity) => { added: number; affected: number } | undefined;
  targetName?: string;
  onRandom: (count: number, genre: RandomGenre) => number | undefined;
}) {
  const [open, setOpen] = useState<string | null>(categories[0]);
  const [search, setSearch] = useState('');
  const [density, setDensity] = useState<AnimationDensity>('normal');
  const [result, setResult] = useState('');
  const [randomOpen, setRandomOpen] = useState(false);
  const [count, setCount] = useState('3');
  const [genre, setGenre] = useState<RandomGenre>('all');
  const [randomResult, setRandomResult] = useState('');
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
    <div className="auto-animation">
      <button className="primary" type="button" disabled={!kind || playing} aria-expanded={randomOpen && Boolean(kind)}
        onClick={() => { setRandomOpen(!randomOpen); setRandomResult(''); }}>🎲 ランダム追加</button>
      {randomOpen && kind && <form className="auto-animation" onSubmit={event => {
        event.preventDefault();
        const added = onRandom(Number(count), genre);
        if (added !== undefined) setRandomResult(added ? `${added}件追加しました。` : '対象クリップに1フレーム分の空き時間がないか、対応テンプレートがありません。');
      }}>
        <p className="random-target" title={targetName}>対象 {targetName}</p>
        <label>追加個数<input type="number" required min={1} max={RANDOM_BATCH_LIMIT} step={1} value={count}
          onChange={event => { setCount(event.target.value); setRandomResult(''); }} /></label>
        <label>対象ジャンル<select value={genre} onChange={event => {
          setGenre(event.target.value as RandomGenre); setRandomResult('');
        }}>
          <option value="all">すべて</option>
          {categories.map(category => <option key={category}>{category}</option>)}
        </select></label>
        {Number(count) > 30 && <p>大量の効果を重ねるとプレビューが重くなることがあります。</p>}
        <button className="primary" type="submit" disabled={playing}>適用</button>
        {randomResult && <p role="status">{randomResult}</p>}
      </form>}
    </div>
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
