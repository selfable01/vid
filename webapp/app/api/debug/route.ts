import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const maxDuration = 30;

export async function GET() {
  const checks: Record<string, unknown> = {};

  // Check tmp dir
  checks.tmpdir = os.tmpdir();
  checks.platform = process.platform;
  checks.arch = process.arch;
  checks.cwd = process.cwd();

  // Check COOKIES_TXT env var
  checks.hasCookiesTxt = !!process.env.COOKIES_TXT;
  checks.cookiesTxtLength = process.env.COOKIES_TXT?.length ?? 0;

  // Check yt-dlp candidates
  const candidates = [
    '/tmp/yt-dlp',
    path.join(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp'),
    path.join(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp.exe'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];
  checks.ytdlpCandidates = candidates.map(p => ({ path: p, exists: fs.existsSync(p) }));

  // Check ffmpeg
  try {
    const ffmpegStatic = require('ffmpeg-static');
    checks.ffmpegPath = ffmpegStatic;
    checks.ffmpegExists = fs.existsSync(ffmpegStatic);
  } catch (e) {
    checks.ffmpegError = String(e);
  }

  // Try running yt-dlp if found
  const ytdlpBin = candidates.find(p => fs.existsSync(p));
  if (ytdlpBin) {
    try {
      const { stdout } = await execFileAsync(ytdlpBin, ['--version']);
      checks.ytdlpVersion = stdout.trim();
    } catch (e) {
      checks.ytdlpRunError = String(e);
    }
  }

  return NextResponse.json(checks);
}
