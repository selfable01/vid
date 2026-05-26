import { NextRequest, NextResponse } from 'next/server';
import { submitVeoJob } from '@/lib/veo';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { prompt, aspectRatio, videoBase64 } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const job = await submitVeoJob(
      prompt,
      aspectRatio ?? '16:9',
      videoBase64 ?? undefined
    );

    return NextResponse.json({ operationName: job.operationName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/generate]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
