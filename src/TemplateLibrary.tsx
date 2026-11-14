import { memo, useEffect, useMemo, useState } from 'react';
import { categories } from './animation';
import { registry, templates } from './templates';
import type { Template } from './animation';
import type { FontProvider } from './fonts';
import { TemplateSample } from './TemplateSample';
import { parsePreferences, preferencesKey, rememberTemplate, searchTemplates } from './libraryPreferences';
import { Icon } from './Icon';
import type { AnimationDensity } from './autoAnimation';
import { RANDOM_BATCH_LIMIT } from './randomAnimation';
import type { RandomGenre } from './randomAnimation';

const knownIds = new Set(registry.keys());
const folders = ['お気に入り', '最近使った', 'すべて', ...categories];
const categoryLists = new Map<string, Template[]>([...categories.map(category =>
  [category, templates.filter(item => item.category === category)] as const), ['すべて', templates] as const]);
const fromIds = (ids: string[]) => ids.flatMap(id => registry.get(id) ?? []);

export const TemplateLibrary = memo(function TemplateLibrary({ kind, playing, onAdd, onAuto, targetName, onRandom, fontProvider }: {
  kind?: string; playing: boolean; onAdd: (id: string) => boolean; fontProvider: FontProvider;
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
  const [preferences, setPreferences] = useState(() => {
    try { return parsePreferences(localStorage.getItem(preferencesKey), knownIds); }
    catch { return parsePreferences(null, knownIds); }
  });
  useEffect(() => {
    try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)); }
    catch { /* Browser storage may be unavailable. */ }
  }, [preferences]);
  const [sample, setSample] = useState<Template>();
  const searching = Boolean(search.trim());
  const matches = useMemo(() => searchTemplates(templates, search), [search]);
  const favorites = useMemo(() => new Set(preferences.favorites), [preferences.favorites]);
  const cards = (items: Template[]) => <div className="template-grid">{items.map(item => {
    const favorite = favorites.has(item.id);
    return <div className="template-tile" key={item.id}>
      <button type="button" disabled={!kind || playing || (item.textOnly && kind !== 'text')}
        title={item.textOnly ? 'テキスト専用' : item.label}
        className={`template-card ${item.tone}`} onClick={() => {
          if (onAdd(item.id)) setPreferences(previous => ({ ...previous, recent: rememberTemplate(previous.recent, item.id) }));
        }}>
        <span className="template-icon"><Icon name={item.icon} size={20} /></span><span>{item.label}</span>
      </button>
      <div className="template-tools">
        <button type="button" aria-label={`${item.label}のお気に入り`} aria-pressed={favorite}
          title={favorite ? 'お気に入りを解除' : 'お気に入りに登録'} onClick={() => setPreferences(previous => ({
            ...previous, favorites: favorite ? previous.favorites.filter(id => id !== item.id) : [...previous.favorites, item.id],
          }))}>{favorite ? '★' : '☆'}</button>
        <button type="button" disabled={playing} aria-label={`${item.label}の動作プレビュー`}
          aria-pressed={sample?.id === item.id} title="動作プレビュー"
          onClick={() => setSample(current => current?.id === item.id ? undefined : item)}>▷</button>
      </div>
    </div>;
  })}</div>;
  const folderItems = (folder: string) => folder === 'お気に入り' ? fromIds(preferences.favorites)
    : folder === '最近使った' ? fromIds(preferences.recent)
    : categoryLists.get(folder) ?? [];
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
    {sample && !playing && <TemplateSample template={sample} kind={kind} fontProvider={fontProvider} onClose={() => setSample(undefined)} />}
    {searching ? (matches.length ? cards(matches) : <p>一致するテンプレートがありません。</p>) :
      <div className="template-folders">{folders.map(category => {
        const expanded = open === category;
        const items = expanded ? folderItems(category) : [];
        return <div key={category}>
        <button className="template-folder" type="button" aria-expanded={open === category}
          onClick={() => setOpen(open === category ? null : category)}>
          <Icon name={open === category ? 'down' : 'chevron'} size={14} />{category}
        </button>
          {expanded && (items.length ? cards(items) : <p>まだテンプレートがありません。</p>)}
        </div>;
      })}</div>}
  </aside>;
});
