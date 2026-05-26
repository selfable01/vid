import { NextRequest, NextResponse } from 'next/server';
import { analyzeFrames, generateVeoPrompts } from '@/lib/gemini';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { frames, title, aspectRatio } = await req.json();

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: 'frames array is required' }, { status: 400 });
    }

    // Step 1: Analyze frames
    const analysis = await analyzeFrames(frames, title ?? '', aspectRatio ?? '16:9');

    // Step 2: Generate 4 Veo prompts from the analysis
    const prompts = await generateVeoPrompts(analysis, title ?? '', aspectRatio ?? '16:9', frames.length);

    const allPrompts = [prompts.initial_prompt, ...prompts.extension_prompts.slice(0, 3)];

    // Pad to exactly 4 if needed
    while (allPrompts.length < 4) {
      allPrompts.push(allPrompts[allPrompts.length - 1]);
    }

    return NextResponse.json({
      analysis,
      videoDescription: prompts.video_description,
      coreAction: prompts.core_action,
      allPrompts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/analyze]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
