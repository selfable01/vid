'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

const SLOTS = [1, 2, 3, 4];

export default function CombinePage() {
  const [files, setFiles] = useState<(File | null)[]>([null, null, null, null]);
  const [status, setStatus] = useState<'idle' | 'combining' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

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
    // reset input so same file can be re-selected
    e.target.value = '';
  }

  function removeFile(i: number) {
    setFiles(prev => {
      const next = [...prev];
      next[i] = null;
      return next;
    });
  }

  const filled = files.filter(Boolean);
  const canCombine = filled.length >= 2 && status !== 'combining';

  async function combine() {
    if (!canCombine) return;
    setStatus('combining');
    setError('');
    setDownloadUrl('');

    const form = new FormData();
    files.forEach((f, i) => {
      if (f) form.append(`video${i + 1}`, f);
    });
    // tell the server the order
    form.append('order', files.map((f, i) => f ? String(i + 1) : '').filter(Boolean).join(','));

    try {
      const res = await fetch('/api/combine', { method: 'POST', body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  function reset() {
    setFiles([null, null, null, null]);
    setStatus('idle');
    setError('');
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl('');
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 underline">
              ← Prompt Generator
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Combine Videos</h1>
          <p className="text-zinc-400 text-sm">
            Upload your 4 Seedance MP4 clips in order — they'll be stitched into one video.
          </p>
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
                      className="text-zinc-500 hover:text-red-400 text-xs shrink-0"
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
                  className="w-full h-full min-h-[100px] bg-zinc-900 border border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-zinc-500 hover:bg-zinc-800 transition"
                >
                  <span className="bg-zinc-800 text-zinc-400 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                    {slot}
                  </span>
                  <span className="text-xs text-zinc-500">Click to upload clip {slot}</span>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Info */}
        <p className="text-xs text-zinc-600 text-center">
          {filled.length === 0
            ? 'Upload at least 2 clips to combine'
            : `${filled.length} clip${filled.length > 1 ? 's' : ''} selected — clips will be joined in slot order`}
        </p>

        {/* Error */}
        {status === 'error' && (
          <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Done */}
        {status === 'done' && downloadUrl && (
          <div className="bg-green-950 border border-green-800 rounded-xl p-5 space-y-3 text-center">
            <p className="text-green-300 font-semibold">Video combined successfully!</p>
            <a
              href={downloadUrl}
              download="combined.mp4"
              className="inline-block bg-white text-zinc-950 font-semibold px-6 py-3 rounded-lg text-sm hover:bg-zinc-200 transition"
            >
              Download combined.mp4
            </a>
            <div>
              <button onClick={reset} className="text-xs text-green-600 hover:text-green-400 underline mt-2">
                Start over
              </button>
            </div>
          </div>
        )}

        {/* Combine button */}
        {status !== 'done' && (
          <button
            onClick={status === 'combining' ? undefined : combine}
            disabled={!canCombine}
            className="w-full bg-white text-zinc-950 font-semibold py-3 rounded-lg text-sm hover:bg-zinc-200 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === 'combining' ? (
              <>
                <Spinner />
                Combining videos…
              </>
            ) : (
              'Combine Videos'
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
