import { NextRequest, NextResponse } from 'next/server';
import { getYouTubeStream, extractYouTubeId, extractInstagramId } from '@/lib/youtube';
import { extractFramesFromStream } from '@/lib/ffmpeg';

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

      return NextResponse.json({
        videoId,
        title,
        durationSeconds,
        aspectRatio,
        frameCount: frames.length,
        frames,
      });
    }

    if (isInstagram) {
      const shortcode = extractInstagramId(url);
      if (!shortcode) return NextResponse.json({ error: 'Invalid Instagram URL' }, { status: 400 });

      // Instagram: scrape the video URL from the page then stream through ffmpeg
      const pageRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      const html = await pageRes.text();

      let videoUrl = '';
      const ogVideoMatch = html.match(/property="og:video"[^>]*content="([^"]+)"/);
      if (ogVideoMatch) videoUrl = ogVideoMatch[1].replace(/&amp;/g, '&');

      if (!videoUrl) {
        const sharedDataMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/);
        if (sharedDataMatch) videoUrl = sharedDataMatch[1].replace(/\\u0026/g, '&');
      }

      let title = shortcode;
      const titleMatch = html.match(/property="og:title"[^>]*content="([^"]+)"/);
      if (titleMatch) title = titleMatch[1];

      if (!videoUrl) {
        return NextResponse.json({
          error: 'Could not extract Instagram video URL. The reel may be private or require login.',
        }, { status: 422 });
      }

      // Stream the video through ffmpeg
      const videoRes = await fetch(videoUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!videoRes.ok || !videoRes.body) {
        return NextResponse.json({ error: 'Failed to download Instagram video' }, { status: 422 });
      }

      const { Readable } = await import('stream');
      const nodeStream = Readable.fromWeb(videoRes.body as Parameters<typeof Readable.fromWeb>[0]);
      const frames = await extractFramesFromStream(nodeStream, shortcode, 15);

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
