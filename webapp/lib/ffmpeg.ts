import Ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

if (ffmpegStatic) {
  Ffmpeg.setFfmpegPath(ffmpegStatic);
}

function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const result: T[] = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}

export async function extractFramesFromStream(
  videoStream: Readable,
  videoId: string,
  maxFrames = 15
): Promise<string[]> {
  const tmpDir = path.join(os.tmpdir(), `veo_${videoId}_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    await new Promise<void>((resolve, reject) => {
      Ffmpeg(videoStream)
        .outputOptions([
          '-vf', 'fps=1,scale=640:-1',
          '-q:v', '3',
          '-vframes', String(maxFrames * 4), // extract more, then sample
        ])
        .output(path.join(tmpDir, 'frame_%03d.jpg'))
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const files = fs.readdirSync(tmpDir)
      .filter(f => f.endsWith('.jpg'))
      .sort();

    const selected = sampleEvenly(files, maxFrames);

    return selected.map(f => {
      const buf = fs.readFileSync(path.join(tmpDir, f));
      return buf.toString('base64');
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function extractFramesFromFile(
  filePath: string,
  videoId: string,
  maxFrames = 15
): Promise<string[]> {
  const tmpDir = path.join(os.tmpdir(), `veo_${videoId}_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    await new Promise<void>((resolve, reject) => {
      Ffmpeg(filePath)
        .outputOptions([
          '-vf', 'fps=1,scale=640:-1',
          '-q:v', '3',
          '-vframes', String(maxFrames * 4),
        ])
        .output(path.join(tmpDir, 'frame_%03d.jpg'))
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const files = fs.readdirSync(tmpDir)
      .filter(f => f.endsWith('.jpg'))
      .sort();

    const selected = sampleEvenly(files, maxFrames);

    return selected.map(f => {
      const buf = fs.readFileSync(path.join(tmpDir, f));
      return buf.toString('base64');
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
