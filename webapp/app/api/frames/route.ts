import { NextRequest, NextResponse } from 'next/server';
import { getYouTubeStream, extractYouTubeId, extractInstagramId } from '@/lib/youtube';
import { extractFramesFromStream, extractFramesFromFile } from '@/lib/ffmpeg';
import youtubeDl from 'youtube-dl-exec';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export const maxDuration = 300; // 5 min — requires Vercel Pro

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

    if (isYouTube) {
      const videoId = extractYouTubeId(url);
      if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });

      const { stream, title, durationSeconds, aspectRatio } = await getYouTubeStream(url);
      const frames = await extractFramesFromStream(stream, videoId, 15);

      return NextResponse.json({ videoId, title, durationSeconds, aspectRatio, frameCount: frames.length, frames });
    }

    if (isInstagram) {
      const shortcode = extractInstagramId(url);
      if (!shortcode) return NextResponse.json({ error: 'Invalid Instagram URL' }, { status: 400 });

      const tmpFile = path.join(os.tmpdir(), `ig_${shortcode}_${Date.now()}.mp4`);

      try {
        // Use yt-dlp (via youtube-dl-exec) — handles Instagram auth and CDN changes automatically
        await youtubeDl(url, {
          output: tmpFile,
          format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio/best',
          noPlaylist: true,
          noCheckCertificates: true,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        });
      } catch (dlErr) {
        const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
        return NextResponse.json({
          error: `Could not download Instagram reel. Make sure the reel is public. Details: ${msg.slice(0, 300)}`,
        }, { status: 422 });
      }

      if (!fs.existsSync(tmpFile)) {
        return NextResponse.json({ error: 'Download completed but output file not found.' }, { status: 500 });
      }

      let frames: string[] = [];
      try {
        frames = await extractFramesFromFile(tmpFile, shortcode, 15);
      } finally {
        try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
      }

      // Get title via yt-dlp metadata (best effort)
      let title = shortcode;
      try {
        const info = await youtubeDl(url, { dumpSingleJson: true, noWarnings: true, noPlaylist: true }) as Record<string, unknown>;
        title = (info?.title as string) || (info?.description as string)?.slice(0, 80) || shortcode;
      } catch { /* ignore */ }

      return NextResponse.json({
        videoId: shortcode,
        title,
        durationSeconds: 0,
        aspectRatio: '9:16' as const,
        frameCount: frames.length,
        frames,
      });
    }

    return NextResponse.json({ error: 'Unsupported URL' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/frames]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
