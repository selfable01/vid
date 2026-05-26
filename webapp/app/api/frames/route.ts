import { NextRequest, NextResponse } from 'next/server';
import { extractInstagramId, extractYouTubeId } from '@/lib/youtube';
import { extractFramesFromFile } from '@/lib/ffmpeg';
import youtubeDl from 'youtube-dl-exec';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export const maxDuration = 300;

// Write cookies to a temp file.
// On Vercel: COOKIES_TXT env var holds the raw cookies.txt content.
// Locally: use webapp/cookies.txt if present.
function getCookiesFile(): string | null {
  const tmpCookies = path.join(os.tmpdir(), 'yt_cookies.txt');

  // 1. From env var (Vercel)
  if (process.env.COOKIES_TXT) {
    fs.writeFileSync(tmpCookies, process.env.COOKIES_TXT, 'utf-8');
    return tmpCookies;
  }

  // 2. Local file next to the app
  const localPath = path.join(process.cwd(), 'cookies.txt');
  if (fs.existsSync(localPath)) {
    fs.copyFileSync(localPath, tmpCookies);
    return tmpCookies;
  }

  return null;
}

async function downloadWithYtDlp(
  url: string,
  outputFile: string,
  cookiesFile: string | null
): Promise<void> {
  const opts: Record<string, unknown> = {
    output: outputFile,
    format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio/best',
    noPlaylist: true,
    noCheckCertificates: true,
  };
  if (cookiesFile) opts.cookies = cookiesFile;

  await youtubeDl(url, opts);
}

async function getTitle(url: string, cookiesFile: string | null, fallback: string): Promise<string> {
  try {
    const opts: Record<string, unknown> = {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
      skipDownload: true,
    };
    if (cookiesFile) opts.cookies = cookiesFile;
    const info = await youtubeDl(url, opts) as Record<string, unknown>;
    return (info?.title as string) || (info?.description as string)?.slice(0, 80) || fallback;
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

    const cookiesFile = getCookiesFile();
    const id = isYouTube ? extractYouTubeId(url) : extractInstagramId(url);
    if (!id) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });

    const safeId = id.replace(/[^A-Za-z0-9_-]/g, '_');
    const tmpFile = path.join(os.tmpdir(), `vid_${safeId}_${Date.now()}.mp4`);

    // Download
    try {
      await downloadWithYtDlp(url, tmpFile, cookiesFile);
    } catch (dlErr) {
      const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
      return NextResponse.json({
        error: `Download failed: ${msg.slice(0, 400)}`,
      }, { status: 422 });
    }

    if (!fs.existsSync(tmpFile)) {
      return NextResponse.json({ error: 'Download completed but output file was not found.' }, { status: 500 });
    }

    // Extract frames
    let frames: string[] = [];
    try {
      frames = await extractFramesFromFile(tmpFile, safeId, 15);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }

    const title = await getTitle(url, cookiesFile, safeId);
    const aspectRatio = isInstagram ? '9:16' : '16:9';

    return NextResponse.json({
      videoId: safeId,
      title,
      durationSeconds: 0,
      aspectRatio,
      frameCount: frames.length,
      frames,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/frames]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
