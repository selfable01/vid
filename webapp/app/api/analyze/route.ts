import { NextRequest, NextResponse } from 'next/server';
import { generateSeedancePrompts } from '@/lib/gemini';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { frames, title, aspectRatio, durationSeconds } = await req.json();

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: 'frames array is required' }, { status: 400 });
    }

    const result = await generateSeedancePrompts(
      frames,
      title ?? '',
      aspectRatio ?? '16:9',
      durationSeconds ?? 0
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/analyze]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
