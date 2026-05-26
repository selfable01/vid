import Ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ffmpeg-static resolves its path at install time which can be wrong on Vercel
// (/ROOT/... at build vs /var/task/... at runtime). Fall back to cwd-relative path.
function resolveFfmpegPath(): string {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const alt = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', bin);
  if (fs.existsSync(alt)) return alt;
  throw new Error(`ffmpeg binary not found. Tried: ${ffmpegStatic}, ${alt}`);
}

Ffmpeg.setFfmpegPath(resolveFfmpegPath());

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
