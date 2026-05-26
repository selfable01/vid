import { NextRequest, NextResponse } from 'next/server';

const VEO_API_KEY = process.env.GEMINI_API_KEY!;

export const maxDuration = 60;

// Proxies Veo video URIs so the browser can play them without exposing the API key
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uri = searchParams.get('uri');
  const download = searchParams.get('download') === '1';

  if (!uri) {
    return NextResponse.json({ error: 'uri is required' }, { status: 400 });
  }

  const upstream = await fetch(uri, {
    headers: { 'x-goog-api-key': VEO_API_KEY },
  });

  if (!upstream.ok || !upstream.body) {
    return new NextResponse('Failed to fetch video', { status: upstream.status });
  }

  const headers: Record<string, string> = {
    'Content-Type': upstream.headers.get('Content-Type') ?? 'video/mp4',
    'Cache-Control': 'public, max-age=3600',
  };

  if (download) {
    headers['Content-Disposition'] = 'attachment; filename="clip.mp4"';
  }

  return new NextResponse(upstream.body, { headers });
}
