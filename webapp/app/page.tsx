'use client';

import { useState } from 'react';
import Link from 'next/link';

type Step = 'idle' | 'extracting' | 'analyzing' | 'done' | 'error';

interface Segment {
  segment: number;
  timeRange: string;
  keyAction: string;
  prompt: string;
}

interface Result {
  videoSummary: string;
  style: string;
  segments: Segment[];
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [stepMsg, setStepMsg] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  const isRunning = step === 'extracting' || step === 'analyzing';

  async function run() {
    if (!url.trim() || isRunning) return;
    setError('');
    setResult(null);

    // Step 1: Extract frames
    setStep('extracting');
    setStepMsg('Downloading video and extracting frames…');

    const framesRes = await fetch('/api/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim() }),
    });
    const framesData = await framesRes.json();

    if (!framesRes.ok || framesData.error) {
      setStep('error');
      setError(framesData.error ?? 'Frame extraction failed');
      return;
    }

    const { frames, title, aspectRatio, durationSeconds, frameCount } = framesData;
    setStepMsg(`Extracted ${frameCount} frames from "${title}" — analyzing with Gemini…`);

    // Step 2: Analyze and generate Seedance prompts
    setStep('analyzing');

    const analyzeRes = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames, title, aspectRatio, durationSeconds }),
    });
    const analyzeData = await analyzeRes.json();

    if (!analyzeRes.ok || analyzeData.error) {
      setStep('error');
      setError(analyzeData.error ?? 'Analysis failed');
      return;
    }

    setResult(analyzeData as Result);
    setStep('done');
    setStepMsg('');
  }

  async function copyPrompt(text: string, idx: number) {
    await navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyAll(segments: Segment[]) {
    const text = segments.map(s =>
      `=== Segment ${s.segment} (${s.timeRange}) ===\n${s.prompt}`
    ).join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(-1);
    setTimeout(() => setCopied(null), 2000);
  }

  function reset() {
    setStep('idle');
    setResult(null);
    setError('');
    setStepMsg('');
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-3xl space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Link href="/combine" className="text-xs text-zinc-500 hover:text-zinc-300 underline">
              Combine Videos →
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Seedance Prompt Generator</h1>
          <p className="text-zinc-400 text-sm">
            Paste a YouTube or Instagram Reel URL. We'll analyze it frame-by-frame and generate
            4 detailed Seedance prompts (4 × 15s = 60s of video).
          </p>
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-zinc-400 placeholder:text-zinc-600 disabled:opacity-50"
            placeholder="https://youtube.com/watch?v=... or https://instagram.com/reel/..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={isRunning}
            onKeyDown={e => e.key === 'Enter' && run()}
          />
          <button
            onClick={isRunning ? reset : run}
            disabled={!isRunning && !url.trim()}
            className="bg-white text-zinc-950 font-semibold px-6 py-3 rounded-lg text-sm hover:bg-zinc-200 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isRunning ? 'Cancel' : 'Analyze'}
          </button>
        </div>

        {/* Loading */}
        {isRunning && (
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <Spinner />
            <span>{stepMsg}</span>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
            <strong>Error:</strong> {error}
            <button onClick={reset} className="ml-4 underline text-red-400 hover:text-red-200">Try again</button>
          </div>
        )}

        {/* Results */}
        {result && step === 'done' && (
          <div className="space-y-6">

            {/* Summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-zinc-300">Video Analysis</h2>
                <button onClick={reset} className="text-xs text-zinc-500 hover:text-zinc-300 underline">
                  Analyze another
                </button>
              </div>
              <p className="text-sm text-zinc-300">{result.videoSummary}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">Style</span>
                <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">{result.style}</span>
              </div>
            </div>

            {/* Copy all button */}
            <div className="flex justify-end">
              <button
                onClick={() => copyAll(result.segments)}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg transition"
              >
                {copied === -1 ? '✓ Copied all' : 'Copy all 4 prompts'}
              </button>
            </div>

            {/* Segment cards */}
            {result.segments.map((seg, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Card header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <span className="bg-white text-zinc-950 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                      {seg.segment}
                    </span>
                    <div>
                      <span className="text-sm font-medium">Segment {seg.segment}</span>
                      <span className="text-zinc-500 text-xs ml-2">{seg.timeRange}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => copyPrompt(seg.prompt, i)}
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition text-zinc-300"
                  >
                    {copied === i ? '✓ Copied' : 'Copy'}
                  </button>
                </div>

                {/* Key action */}
                <div className="px-5 py-2 border-b border-zinc-800 bg-zinc-950">
                  <span className="text-xs text-zinc-500 uppercase tracking-wide mr-2">Action</span>
                  <span className="text-xs text-zinc-300">{seg.keyAction}</span>
                </div>

                {/* Prompt */}
                <div className="px-5 py-4">
                  <p className="text-sm text-zinc-300 leading-relaxed">{seg.prompt}</p>
                </div>
              </div>
            ))}
          </div>
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
