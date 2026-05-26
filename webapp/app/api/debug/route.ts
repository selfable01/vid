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

  checks.tmpdir = os.tmpdir();
  checks.platform = process.platform;
  checks.arch = process.arch;
  checks.cwd = process.cwd();
  checks.nodeExecPath = process.execPath;

  // Cookies
  checks.hasCookiesTxt = !!process.env.COOKIES_TXT;
  checks.cookiesTxtLength = process.env.COOKIES_TXT?.length ?? 0;

  // yt-dlp candidates
  const ytdlpCandidates = [
    '/tmp/yt-dlp',
    path.join(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ];
  checks.ytdlpCandidates = ytdlpCandidates.map(p => ({ path: p, exists: fs.existsSync(p) }));

  const ytdlpBin = ytdlpCandidates.find(p => fs.existsSync(p));
  if (ytdlpBin) {
    try {
      fs.chmodSync(ytdlpBin, 0o755);
      const nodeBin = path.dirname(process.execPath);
      const env = { ...process.env, PATH: `${nodeBin}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}` };
      const { stdout } = await execFileAsync(ytdlpBin, ['--version'], { env });
      checks.ytdlpVersion = stdout.trim();
    } catch (e) {
      checks.ytdlpRunError = String(e);
    }
  }

  // ffmpeg — check both the static module path and the cwd-relative fallback
  try {
    const ffmpegStatic: string = require('ffmpeg-static');
    const ffmpegFallback = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
    checks.ffmpegStaticPath = ffmpegStatic;
    checks.ffmpegStaticExists = fs.existsSync(ffmpegStatic);
    checks.ffmpegFallbackPath = ffmpegFallback;
    checks.ffmpegFallbackExists = fs.existsSync(ffmpegFallback);
  } catch (e) {
    checks.ffmpegError = String(e);
  }

  return NextResponse.json(checks);
}
