import { useRef, useState } from 'react';
import { quoteFamily, suggestedFonts } from './fonts';
import type { FontOption, FontProvider } from './fonts';

export function FontPicker({ family, fonts, provider, unavailable, onLoad, onChange }: {
  family?: string; fonts: FontOption[]; provider: FontProvider; unavailable: boolean;
  onLoad: () => Promise<number>; onChange: (family?: string) => void;
}) {
  const dropdown = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const term = query.trim();
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const options = new Map(fonts.map(option => [option.family.toLowerCase(), option]));
  for (const option of suggestedFonts) if (!options.has(option.family.toLowerCase()) || option.label !== option.family) {
    options.set(option.family.toLowerCase(), option);
  }
  const matches = Array.from(options.values()).filter(option =>
    [option.family, option.label].some(value => normalize(value).includes(normalize(term))));
  const exact = matches.find(option => [option.family, option.label].some(value => normalize(value) === normalize(term)));

  function choose(value?: string) {
    onChange(value);
    setQuery('');
    dropdown.current!.open = false;
    dropdown.current!.querySelector('summary')?.focus();
  }

  async function load() {
    setPending(true);
    try {
      const count = await onLoad();
      setMessage(count ? '' : 'フォント名を入力すると、インストール済みのフォントを指定できます。');
    } catch {
      setMessage('システムフォント一覧を取得できませんでした。フォント名を入力して指定できます。');
    } finally { setPending(false); }
  }

  return <div className="font-field">
    <span>フォント</span>
    <details ref={dropdown} onToggle={event => { if (event.currentTarget.open) search.current?.focus(); }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}>
      <summary aria-label={`フォント: ${family ?? '既定'}`}>{options.get(family?.toLowerCase() ?? '')?.label ?? family ?? '既定'}</summary>
      <div className="font-options">
        <input ref={search} type="search" aria-label="フォント名を検索" placeholder="フォント名を検索" value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && term) {
              event.preventDefault();
              choose(exact?.family ?? term);
            }
          }} />
        <div className="font-results">
          {!term && <button type="button" onClick={() => choose()}>既定</button>}
          {matches.map(option => <button type="button" key={option.family} onClick={() => choose(option.family)}
            style={provider.has(option.family) ? { fontFamily: `${quoteFamily(option.family)}, sans-serif` } : undefined}>
            {option.label}
          </button>)}
          {term && !exact && <button type="button" onClick={() => choose(term)}>「{term}」を使用</button>}
        </div>
        <button className="font-load" type="button" disabled={pending} onClick={() => void load()}>システムフォントを取得</button>
        {message && <small role="status">{message}</small>}
      </div>
    </details>
    {unavailable && <small role="status">「{family}」が利用できないため、代替フォントで表示しています。</small>}
  </div>;
}
