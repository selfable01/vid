'use client';

import { useState, useRef } from 'react';

type Step = 'idle' | 'extracting' | 'analyzing' | 'generating' | 'polling' | 'done' | 'error';

interface Clip {
  index: number;
  operationName: string;
  prompt: string;
  videoUri?: string;
  status: 'pending' | 'done' | 'error';
  errorMsg?: string;
}

const STEP_ORDER: Step[] = ['extracting', 'analyzing', 'generating', 'polling', 'done'];
const STEP_LABELS: Partial<Record<Step, string>> = {
  extracting: 'Extract Frames',
  analyzing: 'Analyze',
  generating: 'Submit Jobs',
  polling: 'Generate Clips',
  done: 'Done',
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [stepMsg, setStepMsg] = useState('');
  const [clips, setClips] = useState<Clip[]>([]);
  const [error, setError] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const abortRef = useRef(false);

  async function run() {
    if (!url.trim()) return;
    abortRef.current = false;
    setError('');
    setClips([]);
    setVideoDescription('');

    // Step 1: Extract frames
    setStep('extracting');
    setStepMsg('Downloading video and extracting frames at 1 fps…');
    const framesRes = await fetch('/api/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.trim() }),
    });
    const framesData = await framesRes.json();
    if (!framesRes.ok || framesData.error) {
      setStep('error'); setError(framesData.error ?? 'Frame extraction failed'); return;
    }
    const { frames, title, aspectRatio, frameCount } = framesData;
    setStepMsg(`Extracted ${frameCount} frames from "${title}"`);

    // Step 2: Analyze + generate prompts
    setStep('analyzing');
    setStepMsg('Analyzing frames with Gemini 2.5 Flash…');
    const analyzeRes = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames, title, aspectRatio }),
    });
    const analyzeData = await analyzeRes.json();
    if (!analyzeRes.ok || analyzeData.error) {
      setStep('error'); setError(analyzeData.error ?? 'Analysis failed'); return;
    }
    const { allPrompts, videoDescription: desc } = analyzeData;
    setVideoDescription(desc);

    // Step 3: Submit 4 Veo jobs
    setStep('generating');
    const pendingClips: Clip[] = [];
    for (let i = 0; i < 4; i++) {
      setStepMsg(`Submitting clip ${i + 1} of 4…`);
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: allPrompts[i], aspectRatio }),
      });
      const genData = await genRes.json();
      if (!genRes.ok || genData.error) {
        setStep('error'); setError(`Clip ${i + 1} failed: ${genData.error}`); return;
      }
      pendingClips.push({ index: i, operationName: genData.operationName, prompt: allPrompts[i], status: 'pending' });
    }
    setClips([...pendingClips]);

    // Step 4: Poll until all done
    setStep('polling');
    const remaining = new Set(pendingClips.map(c => c.index));
    while (remaining.size > 0 && !abortRef.current) {
      await sleep(15000);
      for (const idx of [...remaining]) {
        const clip = pendingClips[idx];
        const res = await fetch(`/api/status?op=${encodeURIComponent(clip.operationName)}`);
        const data = await res.json();
        if (data.error && data.done === undefined) { clip.status = 'error'; clip.errorMsg = data.error; remaining.delete(idx); }
        else if (data.done) {
          if (data.videoUri) { clip.videoUri = data.videoUri; clip.status = 'done'; }
          else { clip.status = 'error'; clip.errorMsg = data.error ?? 'No video URI'; }
          remaining.delete(idx);
        }
      }
      setClips([...pendingClips]);
      const done = pendingClips.filter(c => c.status !== 'pending').length;
      setStepMsg(`${done} of 4 clips ready…`);
    }
    setStep('done'); setStepMsg('All clips generated!');
  }

  function reset() {
    abortRef.current = true;
    setStep('idle'); setClips([]); setError(''); setVideoDescription(''); setStepMsg('');
  }

  const isRunning = !['idle', 'done', 'error'].includes(step);
  const doneCnt = clips.filter(c => c.status === 'done').length;
  const currentIdx = STEP_ORDER.indexOf(step);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-3xl space-y-8">

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Veo 3.1 Video Generator</h1>
          <p className="text-zinc-400 text-sm">
            Paste a YouTube or Instagram Reel URL — we'll analyze it frame-by-frame and recreate it with Google Veo 3.1
          </p>
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-zinc-400 placeholder:text-zinc-600"
            placeholder="https://youtube.com/watch?v=... or https://instagram.com/reel/..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={isRunning}
            onKeyDown={e => e.key === 'Enter' && !isRunning && run()}
          />
          {!isRunning ? (
            <button onClick={run} disabled={!url.trim()}
              className="bg-white text-zinc-950 font-semibold px-6 py-3 rounded-lg text-sm hover:bg-zinc-200 transition disabled:opacity-40 disabled:cursor-not-allowed">
              Generate
            </button>
          ) : (
            <button onClick={reset}
              className="bg-zinc-700 text-white px-6 py-3 rounded-lg text-sm hover:bg-zinc-600 transition">
              Cancel
            </button>
          )}
        </div>

        {step !== 'idle' && step !== 'error' && (
          <div className="space-y-4">
            {/* Step indicators */}
            <div className="flex items-center justify-center gap-1 flex-wrap">
              {STEP_ORDER.map((s, i) => {
                const done = i < currentIdx;
                const active = i === currentIdx;
                return (
                  <div key={s} className="flex items-center gap-1">
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${active ? 'bg-white text-zinc-950' : done ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-900 text-zinc-600'}`}>
                      {done ? '✓' : active ? <Spinner /> : null}
                      {STEP_LABELS[s]}
                    </div>
                    {i < STEP_ORDER.length - 1 && <div className={`w-4 h-px ${done || active ? 'bg-zinc-500' : 'bg-zinc-800'}`} />}
                  </div>
                );
              })}
            </div>

            {stepMsg && <p className="text-zinc-400 text-sm text-center">{stepMsg}</p>}

            {step === 'polling' && (
              <div className="w-full bg-zinc-800 rounded-full h-1.5">
                <div className="bg-white h-1.5 rounded-full transition-all duration-500" style={{ width: `${(doneCnt / 4) * 100}%` }} />
              </div>
            )}

            {videoDescription && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-300 italic">
                {videoDescription}
              </div>
            )}
          </div>
        )}

        {step === 'error' && error && (
          <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
            <strong>Error:</strong> {error}
            <button onClick={reset} className="ml-4 underline text-red-400 hover:text-red-200">Try again</button>
          </div>
        )}

        {clips.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {clips.map(clip => <ClipCard key={clip.index} clip={clip} />)}
          </div>
        )}
      </div>
    </main>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800">
        <span className="text-xs text-zinc-400 font-medium">Clip {clip.index + 1}</span>
        <span className={`text-xs font-medium ${clip.status === 'done' ? 'text-green-400' : clip.status === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
          {clip.status === 'done' ? 'Ready' : clip.status === 'error' ? 'Failed' : 'Generating…'}
        </span>
      </div>
      <div className="aspect-video bg-zinc-950 flex items-center justify-center">
        {clip.status === 'done' && clip.videoUri ? (
          <video src={`/api/proxy-video?uri=${encodeURIComponent(clip.videoUri)}`} controls autoPlay loop muted playsInline className="w-full h-full object-contain" />
        ) : clip.status === 'error' ? (
          <p className="text-red-400 text-xs px-4 text-center">{clip.errorMsg}</p>
        ) : (
          <div className="flex flex-col items-center gap-2"><Spinner /><span className="text-zinc-600 text-xs">Generating…</span></div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-zinc-800">
        <p className="text-zinc-500 text-xs line-clamp-3">{clip.prompt}</p>
      </div>
      {clip.status === 'done' && clip.videoUri && (
        <div className="px-4 pb-3">
          <a href={`/api/proxy-video?uri=${encodeURIComponent(clip.videoUri)}&download=1`} download={`clip_${clip.index + 1}.mp4`} className="text-xs text-zinc-400 hover:text-white underline transition">
            Download clip {clip.index + 1}
          </a>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
