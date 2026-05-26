import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';

export const maxDuration = 120;

const execFileAsync = promisify(execFile);

function resolveFfmpegPath(): string {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const alt = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', bin);
  if (fs.existsSync(alt)) return alt;
  throw new Error(`ffmpeg binary not found. Tried: ${ffmpegStatic}, ${alt}`);
}

export async function POST(req: NextRequest) {
  const tmpDir = path.join(os.tmpdir(), `combine_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const form = await req.formData();

    // Collect uploaded files in slot order
    const slotFiles: { slot: number; file: File }[] = [];
    for (const [key, value] of form.entries()) {
      if (key.startsWith('video') && value instanceof File && value.size > 0) {
        const slot = parseInt(key.replace('video', ''), 10);
        if (!isNaN(slot)) slotFiles.push({ slot, file: value as File });
      }
    }

    slotFiles.sort((a, b) => a.slot - b.slot);

    if (slotFiles.length < 2) {
      return NextResponse.json({ error: 'At least 2 video files are required' }, { status: 400 });
    }

    // Write uploaded files to disk
    const inputPaths: string[] = [];
    for (const { slot, file } of slotFiles) {
      const dest = path.join(tmpDir, `clip_${slot}.mp4`);
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(dest, buf);
      inputPaths.push(dest);
    }

    const ffmpeg = resolveFfmpegPath();
    const outputPath = path.join(tmpDir, 'combined.mp4');

    if (inputPaths.length === 1) {
      // Just return the single file as-is
      fs.copyFileSync(inputPaths[0], outputPath);
    } else {
      // Write concat list
      const listPath = path.join(tmpDir, 'list.txt');
      const listContent = inputPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
      fs.writeFileSync(listPath, listContent, 'utf-8');

      // Concatenate with ffmpeg using concat demuxer (fast, no re-encode)
      const args = [
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ];

      try {
        const { stderr } = await execFileAsync(ffmpeg, args, { maxBuffer: 10 * 1024 * 1024 });
        if (stderr) console.log('[combine ffmpeg stderr]', stderr.slice(0, 300));
      } catch (e) {
        // If stream copy fails (e.g. mismatched codecs), re-encode
        console.warn('[combine] stream copy failed, re-encoding:', e);
        const reencodeArgs = [
          ...inputPaths.flatMap(p => ['-i', p]),
          '-filter_complex', inputPaths.map((_, i) => `[${i}:v][${i}:a]`).join('') + `concat=n=${inputPaths.length}:v=1:a=1[v][a]`,
          '-map', '[v]',
          '-map', '[a]',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          '-y',
          outputPath,
        ];
        const { stderr: stderr2 } = await execFileAsync(ffmpeg, reencodeArgs, { maxBuffer: 10 * 1024 * 1024 });
        if (stderr2) console.log('[combine re-encode stderr]', stderr2.slice(0, 300));
      }
    }

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      return NextResponse.json({ error: 'ffmpeg ran but output is missing or empty' }, { status: 500 });
    }

    const videoBuffer = fs.readFileSync(outputPath);

    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="combined.mp4"',
        'Content-Length': String(videoBuffer.length),
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/combine]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
