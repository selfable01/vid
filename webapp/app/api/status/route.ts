import { NextRequest, NextResponse } from 'next/server';
import { checkVeoStatus, downloadVideoAsBase64 } from '@/lib/veo';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const opName = searchParams.get('op');
    const download = searchParams.get('download') === 'true';

    if (!opName) {
      return NextResponse.json({ error: 'op query param is required' }, { status: 400 });
    }

    const result = await checkVeoStatus(opName);

    if (result.done && result.videoUri && download) {
      const videoBase64 = await downloadVideoAsBase64(result.videoUri);
      return NextResponse.json({ ...result, videoBase64 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/status]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
