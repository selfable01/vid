'use client';

import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const SLOTS = [1, 2, 3, 4];

export default function CombinePage() {
  const [files, setFiles] = useState<(File | null)[]>([null, null, null, null]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'combining' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegReady, setFfmpegReady] = useState(false);

  useEffect(() => {
    async function loadFfmpeg() {
      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message));
      ffmpeg.on('progress', ({ progress: p }) => {
        setProgress(`處理中… ${Math.round(p * 100)}%`);
      });
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      ffmpegRef.current = ffmpeg;
      setFfmpegReady(true);
    }
    loadFfmpeg().catch(e => {
      console.error('ffmpeg load failed:', e);
      setError('ffmpeg 載入失敗，請重新整理頁面');
      setStatus('error');
    });
  }, []);

  function pickFile(i: number) {
    inputRefs[i].current?.click();
  }

  function onFileChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFiles(prev => {
      const next = [...prev];
      next[i] = f;
      return next;
    });
    e.target.value = '';
  }

  function removeFile(i: number) {
    setFiles(prev => {
      const next = [...prev];
      next[i] = null;
      return next;
    });
  }

  const filled = files.filter(Boolean) as File[];
  const canCombine = filled.length >= 2 && status !== 'combining' && status !== 'loading' && ffmpegReady;

  async function combine() {
    if (!canCombine || !ffmpegRef.current) return;
    setStatus('combining');
    setError('');
    setDownloadUrl('');
    setProgress('正在載入影片檔案…');

    const ffmpeg = ffmpegRef.current;
    const activeFiles = files.map((f, i) => f ? { file: f, slot: i + 1 } : null).filter(Boolean) as { file: File; slot: number }[];

    try {
      // Write each file into ffmpeg virtual FS
      const inputNames: string[] = [];
      for (let i = 0; i < activeFiles.length; i++) {
        const name = `clip${activeFiles[i].slot}.mp4`;
        setProgress(`載入第 ${i + 1}/${activeFiles.length} 段影片…`);
        await ffmpeg.writeFile(name, await fetchFile(activeFiles[i].file));
        inputNames.push(name);
      }

      // Write concat list
      const listContent = inputNames.map(n => `file '${n}'`).join('\n');
      await ffmpeg.writeFile('list.txt', listContent);

      setProgress('合併中，請稍候…');

      // Run ffmpeg concat
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'list.txt',
        '-c', 'copy',
        '-movflags', '+faststart',
        'output.mp4',
      ]);

      // Read result
      const data = await ffmpeg.readFile('output.mp4') as Uint8Array;
      const blob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus('done');
      setProgress('');

      // Cleanup virtual FS
      for (const name of inputNames) {
        ffmpeg.deleteFile(name).catch(() => {});
      }
      ffmpeg.deleteFile('list.txt').catch(() => {});
      ffmpeg.deleteFile('output.mp4').catch(() => {});

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
      setProgress('');
    }
  }

  function reset() {
    setFiles([null, null, null, null]);
    setStatus('idle');
    setError('');
    setProgress('');
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl('');
  }

  const isWorking = status === 'combining' || status === 'loading';

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">影片合併工具</h1>
          <p className="text-zinc-400 text-sm">
            上傳最多 4 個 MP4 片段，直接在瀏覽器中合併為一支完整影片。
          </p>
          {!ffmpegReady && status !== 'error' && (
            <p className="text-xs text-yellow-500 flex items-center justify-center gap-2">
              <Spinner />
              正在載入 ffmpeg，請稍候…
            </p>
          )}
          {ffmpegReady && (
            <p className="text-xs text-green-600">ffmpeg 已就緒</p>
          )}
        </div>

        {/* Slots */}
        <div className="grid grid-cols-2 gap-4">
          {SLOTS.map((slot, i) => (
            <div key={slot}>
              <input
                ref={inputRefs[i]}
                type="file"
                accept="video/mp4,video/*"
                className="hidden"
                onChange={e => onFileChange(i, e)}
                disabled={isWorking}
              />
              {files[i] ? (
                <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="bg-white text-zinc-950 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                        {slot}
                      </span>
                      <span className="text-sm text-zinc-300 truncate">{files[i]!.name}</span>
                    </div>
                    <button
                      onClick={() => removeFile(i)}
                      disabled={isWorking}
                      className="text-zinc-500 hover:text-red-400 text-xs shrink-0 disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 pl-8">
                    {(files[i]!.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => pickFile(i)}
                  disabled={isWorking}
                  className="w-full h-full min-h-[100px] bg-zinc-900 border border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-zinc-500 hover:bg-zinc-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="bg-zinc-800 text-zinc-400 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                    {slot}
                  </span>
                  <span className="text-xs text-zinc-500">點擊上傳第 {slot} 段影片</span>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Info / Progress */}
        <p className="text-xs text-zinc-600 text-center">
          {isWorking
            ? progress
            : filled.length === 0
            ? '請至少上傳 2 段影片才能合併'
            : `已選擇 ${filled.length} 段影片 — 將依照順序合併`}
        </p>

        {/* Error */}
        {status === 'error' && (
          <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
            <strong>錯誤：</strong> {error}
            <button onClick={reset} className="ml-4 underline text-red-400 hover:text-red-200">重試</button>
          </div>
        )}

        {/* Done */}
        {status === 'done' && downloadUrl && (
          <div className="bg-green-950 border border-green-800 rounded-xl p-5 space-y-3 text-center">
            <p className="text-green-300 font-semibold">影片合併成功！</p>
            <a
              href={downloadUrl}
              download="combined.mp4"
              className="inline-block bg-white text-zinc-950 font-semibold px-6 py-3 rounded-lg text-sm hover:bg-zinc-200 transition"
            >
              下載 combined.mp4
            </a>
            <div>
              <button onClick={reset} className="text-xs text-green-600 hover:text-green-400 underline mt-2">
                繼續合併其他影片
              </button>
            </div>
          </div>
        )}

        {/* Combine button */}
        {status !== 'done' && (
          <button
            onClick={isWorking ? undefined : combine}
            disabled={!canCombine}
            className="w-full bg-white text-zinc-950 font-semibold py-3 rounded-lg text-sm hover:bg-zinc-200 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isWorking ? (
              <>
                <Spinner />
                {progress || '合併中，請稍候…'}
              </>
            ) : (
              '合併影片'
            )}
          </button>
        )}
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
