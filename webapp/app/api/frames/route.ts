import { NextRequest, NextResponse } from 'next/server';
import { extractInstagramId, extractYouTubeId } from '@/lib/youtube';
import { extractFramesFromFile } from '@/lib/ffmpeg';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const maxDuration = 300;

const execFileAsync = promisify(execFile);

// Resolve yt-dlp binary — downloads to /tmp if not already present
async function getYtDlpBin(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp'),
    '/tmp/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { fs.chmodSync(p, 0o755); } catch { /* ignore */ }
      return p;
    }
  }

  // Download yt-dlp Linux binary to /tmp at runtime
  const dest = '/tmp/yt-dlp';
  await execFileAsync('curl', [
    '-L', '--silent', '--show-error',
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
    '-o', dest,
  ]);
  fs.chmodSync(dest, 0o755);
  return dest;
}

// Write cookies.txt to /tmp — from env var (Vercel) or local file
function getCookiesFile(): string | null {
  const dest = path.join(os.tmpdir(), 'yt_cookies.txt');

  if (process.env.COOKIES_TXT) {
    fs.writeFileSync(dest, process.env.COOKIES_TXT, 'utf-8');
    return dest;
  }

  const local = path.join(process.cwd(), 'cookies.txt');
  if (fs.existsSync(local)) {
    fs.copyFileSync(local, dest);
    return dest;
  }

  return null;
}

async function ytDlp(bin: string, url: string, outputFile: string, cookiesFile: string | null): Promise<void> {
  const args = [
    url,
    '-o', outputFile,
    '-f', 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio/best',
    '--no-playlist',
    '--no-check-certificates',
    '--socket-timeout', '30',
    '--retries', '3',
  ];
  if (cookiesFile) args.push('--cookies', cookiesFile);

  const { stderr } = await execFileAsync(bin, args, { maxBuffer: 10 * 1024 * 1024 });
  if (stderr) console.log('[yt-dlp stderr]', stderr.slice(0, 500));
}

async function ytDlpGetTitle(bin: string, url: string, cookiesFile: string | null, fallback: string): Promise<string> {
  try {
    const args = [url, '--get-title', '--no-playlist', '--no-warnings', '--socket-timeout', '15'];
    if (cookiesFile) args.push('--cookies', cookiesFile);
    const { stdout } = await execFileAsync(bin, args, { timeout: 20000 });
    return stdout.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const isInstagram = url.includes('instagram.com');

    if (!isYouTube && !isInstagram) {
      return NextResponse.json({ error: 'Only YouTube and Instagram URLs are supported' }, { status: 400 });
    }

    const rawId = isYouTube ? extractYouTubeId(url) : extractInstagramId(url);
    if (!rawId) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });

    const safeId = rawId.replace(/[^A-Za-z0-9_-]/g, '_');
    const tmpFile = path.join(os.tmpdir(), `vid_${safeId}_${Date.now()}.mp4`);

    let bin: string;
    try {
      bin = await getYtDlpBin();
    } catch (e) {
      return NextResponse.json({ error: `yt-dlp binary not found and could not be downloaded: ${e}` }, { status: 500 });
    }

    const cookiesFile = getCookiesFile();

    // Download video
    try {
      await ytDlp(bin, url, tmpFile, cookiesFile);
    } catch (dlErr) {
      const raw = dlErr instanceof Error ? dlErr.message : String(dlErr);
      // Include full stderr in response so we can diagnose
      return NextResponse.json({ error: `yt-dlp download failed:\n${raw.slice(0, 800)}` }, { status: 422 });
    }

    if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size === 0) {
      return NextResponse.json({ error: 'yt-dlp ran but output file is missing or empty.' }, { status: 500 });
    }

    // Extract frames
    let frames: string[] = [];
    try {
      frames = await extractFramesFromFile(tmpFile, safeId, 15);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }

    const title = await ytDlpGetTitle(bin, url, cookiesFile, safeId);
    const aspectRatio = isInstagram ? '9:16' : '16:9';

    return NextResponse.json({ videoId: safeId, title, durationSeconds: 0, aspectRatio, frameCount: frames.length, frames });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/frames]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
