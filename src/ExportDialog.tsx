import { useEffect, useRef, useState } from 'react';
import { downloadFile, resolutions } from './projectFile';
import type { Settings } from './projectFile';
import type { exportVideo } from './exportVideo';

type Snapshot = Omit<Parameters<typeof exportVideo>[0], 'settings' | 'signal' | 'progress'>;

let exportModule: Promise<typeof import('./exportVideo')> | undefined;

export function loadExportModule() {
  exportModule ??= import('./exportVideo').catch(error => {
    exportModule = undefined;
    throw error;
  });
  return exportModule;
}

export function ExportDialog({ settings, onSettings, onClose, snapshot, onReload }: {
  settings: Settings; onSettings: (settings: Settings) => void; onClose: () => void; snapshot: Snapshot;
  onReload: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [status, setStatus] = useState({ fraction: 0, message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    return () => { controller.current?.abort(); };
  }, []);

  async function start() {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    setLoadFailed(false);
    setStatus({ fraction: 0, message: '書き出しを準備しています…' });
    let loading = true;
    try {
      const { exportVideo } = await loadExportModule();
      loading = false;
      abort.signal.throwIfAborted();
      const blob = await exportVideo({ ...snapshot, settings, signal: abort.signal,
        progress: (fraction, message) => { if (!abort.signal.aborted) setStatus({ fraction, message }); } });
      downloadFile(blob, settings.name, '.mp4');
      setStatus({ fraction: 1, message: 'MP4を書き出しました。' });
    } catch (reason) {
      if (abort.signal.aborted) setStatus({ fraction: 0, message: '書き出しをキャンセルしました。' });
      else {
        setStatus({ fraction: 0, message: '' });
        if (loading) setLoadFailed(true);
        else setError(reason instanceof Error ? reason.message : '動画を書き出せませんでした。');
      }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }

  async function reload() {
    setReloading(true);
    try {
      await onReload();
    } catch {
      setError('編集内容をブラウザーに保存できませんでした。閉じるボタンで編集画面に戻り、プロジェクトファイルを保存してから再読み込みしてください。');
      setReloading(false);
    }
  }

  return <dialog ref={dialog} className="export-dialog" aria-labelledby="export-title"
    onCancel={event => {
      event.preventDefault();
      if (reloading) return;
      if (controller.current) controller.current.abort();
      else onClose();
    }}>
    <h2 id="export-title">動画を書き出す</h2>
    <p>MP4 ・ H.264{snapshot.clips.length > 0 ? ' ＋ AAC音声' : ''}</p>
    <fieldset disabled={busy || reloading}>
      <label>解像度<select value={settings.resolution}
        onChange={event => onSettings({ ...settings, resolution: Number(event.target.value) as Settings['resolution'] })}>
        {resolutions.map(value => <option key={value} value={value}>{value === 2160 ? '4K (2160p)' : value + 'p'}</option>)}
      </select></label>
      <label>フレームレート<select value={settings.fps}
        onChange={event => onSettings({ ...settings, fps: event.target.value === '60' ? 60 : 30 })}>
        <option value="30">30 fps</option><option value="60">60 fps</option>
      </select></label>
      <label>画質<select value={settings.quality}
        onChange={event => onSettings({ ...settings, quality: event.target.value === 'high' ? 'high' : 'standard' })}>
        <option value="standard">標準</option><option value="high">高画質</option>
      </select></label>
    </fieldset>
    {busy && <progress aria-label="書き出しの進捗" max={1} value={status.fraction} />}
    {status.message && <p role="status">{busy && Math.floor(status.fraction * 100) + '% ・ '}{status.message}</p>}
    {loadFailed && <p role="alert">書き出し機能を読み込めませんでした。接続を確認してください。古いバージョンを開いている場合は、編集内容を保存してから再読み込みできます。</p>}
    {error && <p role="alert">{error}</p>}
    <div className="export-actions">
      {busy ? <button type="button" onClick={() => {
        controller.current?.abort();
        setStatus(previous => ({ ...previous, message: 'キャンセルしています…' }));
      }}>キャンセル</button> : <>
        <button type="button" disabled={reloading} onClick={onClose}>閉じる</button>
        {loadFailed
          ? <button type="button" className="primary" disabled={reloading} onClick={() => void reload()}>
            {reloading ? '編集内容を保存しています…' : '編集内容を保存して再読み込み'}
          </button>
          : <button type="button" className="primary" onClick={() => void start()}>書き出す</button>}
      </>}
    </div>
  </dialog>;
}
