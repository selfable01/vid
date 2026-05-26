import ytdl from '@distube/ytdl-core';
import { Readable } from 'stream';

export interface VideoInfo {
  videoId: string;
  title: string;
  durationSeconds: number;
  aspectRatio: '16:9' | '9:16';
  stream: Readable;
}

export async function getYouTubeStream(url: string): Promise<VideoInfo> {
  const info = await ytdl.getInfo(url);
  const details = info.videoDetails;

  // Pick lowest quality video-only format to minimize download size
  const format = ytdl.chooseFormat(info.formats, {
    quality: 'lowestvideo',
    filter: (f) => f.hasVideo && !f.hasAudio && !!f.url,
  }) ?? ytdl.chooseFormat(info.formats, { quality: 'lowest' });

  const width = Number(format.width ?? 1920);
  const height = Number(format.height ?? 1080);
  const aspectRatio: '16:9' | '9:16' = height > width ? '9:16' : '16:9';

  const stream = ytdl(url, { format });

  return {
    videoId: details.videoId,
    title: details.title,
    durationSeconds: parseInt(details.lengthSeconds, 10),
    aspectRatio,
    stream,
  };
}

export function extractYouTubeId(url: string): string | null {
  if (url.includes('v=')) return url.split('v=')[1].split('&')[0];
  if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].split('?')[0];
  if (url.includes('/shorts/')) return url.split('/shorts/')[1].split('?')[0];
  return null;
}

export function extractInstagramId(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
