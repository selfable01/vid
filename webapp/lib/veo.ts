const VEO_API_KEY = process.env.GEMINI_API_KEY!;
const VEO_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const VEO_MODEL = 'veo-3.1-generate-preview';

export interface VeoJob {
  operationName: string;
}

export interface VeoResult {
  done: boolean;
  videoUri?: string;
  error?: string;
}

export async function submitVeoJob(
  prompt: string,
  aspectRatio: string,
  videoBase64?: string
): Promise<VeoJob> {
  const instance: Record<string, unknown> = { prompt };
  if (videoBase64) {
    instance.video = { bytesBase64Encoded: videoBase64 };
  }

  const body = {
    instances: [instance],
    parameters: {
      aspectRatio,
      resolution: '720p',
      personGeneration: 'allow_all',
    },
  };

  const res = await fetch(
    `${VEO_BASE}/models/${VEO_MODEL}:predictLongRunning`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': VEO_API_KEY,
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Veo submit error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const operationName = data.name;
  if (!operationName) {
    throw new Error(`No operation name returned: ${JSON.stringify(data)}`);
  }

  return { operationName };
}

export async function checkVeoStatus(operationName: string): Promise<VeoResult> {
  const res = await fetch(
    `${VEO_BASE}/${operationName}`,
    {
      headers: { 'x-goog-api-key': VEO_API_KEY },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Veo status error ${res.status}: ${err}`);
  }

  const data = await res.json();

  if (data.error) {
    return { done: true, error: data.error.message ?? JSON.stringify(data.error) };
  }

  if (!data.done) {
    return { done: false };
  }

  const samples = data.response?.generateVideoResponse?.generatedSamples ?? [];
  const videoUri = samples[0]?.video?.uri;

  if (!videoUri) {
    return { done: true, error: `No video URI in response: ${JSON.stringify(data).slice(0, 300)}` };
  }

  return { done: true, videoUri };
}

export async function downloadVideoAsBase64(videoUri: string): Promise<string> {
  const res = await fetch(videoUri, {
    headers: { 'x-goog-api-key': VEO_API_KEY },
  });
  if (!res.ok) throw new Error(`Download error ${res.status}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString('base64');
}
