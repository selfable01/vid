const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.5-flash';

async function callGemini(body: object): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export interface SeedanceSegment {
  segment: number;        // 1–4
  timeRange: string;      // e.g. "0:00–0:15"
  prompt: string;         // detailed Seedance prompt
  keyAction: string;      // one-line summary of what happens
}

export interface SeedancePrompts {
  videoSummary: string;
  style: string;
  segments: SeedanceSegment[];
}

export async function generateSeedancePrompts(
  frameBase64s: string[],
  title: string,
  aspectRatio: string,
  durationSeconds: number
): Promise<SeedancePrompts> {
  const totalFrames = frameBase64s.length;

  // Build parts — send all frames so Gemini sees the full video
  const parts: object[] = frameBase64s.map((data, i) => ({
    inlineData: { mimeType: 'image/jpeg', data },
    // Each frame = 1 second (since we extract at 1fps)
  }));

  const estimatedDuration = durationSeconds > 0 ? durationSeconds : totalFrames;

  parts.push({
    text: `
Title: "${title}"
Aspect Ratio: ${aspectRatio}
Estimated Duration: ~${estimatedDuration} seconds
Frames provided: ${totalFrames} frames (1 frame per second of video)

TASK: Generate 4 sequential Seedance video prompts that together recreate this video exactly.
Each segment covers 15 seconds of content (4 × 15s = 60 seconds total).
The frames are in chronological order — use them to understand what happens at each part of the video.
    `.trim(),
  });

  const systemText = `You are an expert AI video director and prompt engineer specializing in Seedance video generation.

You receive video frames (1 per second, in order) from a reference video. Your job is to generate 4 detailed, sequential Seedance prompts that will recreate this video as faithfully as possible.

SEGMENT STRUCTURE:
- Segment 1: frames 1–${Math.ceil(totalFrames * 0.25)} (first quarter of video)
- Segment 2: frames ${Math.ceil(totalFrames * 0.25) + 1}–${Math.ceil(totalFrames * 0.5)} (second quarter)
- Segment 3: frames ${Math.ceil(totalFrames * 0.5) + 1}–${Math.ceil(totalFrames * 0.75)} (third quarter)
- Segment 4: frames ${Math.ceil(totalFrames * 0.75) + 1}–${totalFrames} (final quarter)

ETHNICITY RULE (apply before writing any prompt):
- Look at the people in the reference video.
- If they are NOT Asian (e.g. they appear White, Black, Hispanic, Middle Eastern, etc.), replace them with Asian people in ALL prompts. Keep the same gender, approximate age, clothing, and actions — only change the ethnicity to Asian.
- If they are already Asian, keep them as-is.
- Always write the subject description as "Asian [man/woman/person] in their [age range]s" when the substitution applies.
- Apply this consistently across all 4 segments so the character looks the same throughout.

EACH PROMPT MUST INCLUDE (in this order, as a single flowing paragraph):
1. SUBJECT: Exact description of who/what is in frame — age, gender, ethnicity (Asian if substitution applies), hair color/style, clothing color and style, accessories, facial expression
2. ACTION: Precisely what the subject is doing — specific body movements, gestures, interactions with objects or environment
3. SETTING: Exact location — indoor/outdoor, background elements, furniture, props, environment details
4. CAMERA: Shot type (close-up/medium/wide), camera angle (eye-level/low/high), camera movement (static/pan/tilt/zoom/tracking/handheld)
5. LIGHTING: Light source direction, quality (hard/soft), color temperature (warm/cool/neutral), shadows
6. COLOR PALETTE: Dominant colors in the scene, overall color grading/mood
7. CONTINUITY NOTE: Brief note on how this segment connects to the previous one (for segments 2–4)

CRITICAL RULES:
- Be extremely specific — never say "a person" when you can say "a woman in her late 20s with long dark hair wearing a white crop top and high-waisted jeans"
- Each prompt must accurately reflect what is ACTUALLY happening in those frames — not generic descriptions
- Maintain visual consistency across all 4 prompts (same characters look the same throughout)
- Each prompt = exactly 15 seconds of video content
- No dialogue, voiceover, or audio descriptions (Seedance is video-only)
- End each prompt with: ", cinematic quality, 4K, [${aspectRatio} aspect ratio]"

OUTPUT FORMAT — valid JSON only, no markdown fences:
{
  "videoSummary": "2-3 sentence description of the complete video",
  "style": "visual style, color grade, and cinematographic feel of the original",
  "segments": [
    {
      "segment": 1,
      "timeRange": "0:00–0:15",
      "keyAction": "one-line summary of main action in this segment",
      "prompt": "full detailed Seedance prompt paragraph..."
    },
    {
      "segment": 2,
      "timeRange": "0:15–0:30",
      "keyAction": "...",
      "prompt": "..."
    },
    {
      "segment": 3,
      "timeRange": "0:30–0:45",
      "keyAction": "...",
      "prompt": "..."
    },
    {
      "segment": 4,
      "timeRange": "0:45–1:00",
      "keyAction": "...",
      "prompt": "..."
    }
  ]
}`;

  const text = await callGemini({
    contents: [{ role: 'user', parts }],
    systemInstruction: { parts: [{ text: systemText }] },
    generationConfig: { temperature: 0.2 },
  });

  let clean = text.replace(/[\x00-\x1F\x7F]/g, ' ').trim();
  // Strip markdown fences if present
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  try {
    return JSON.parse(clean) as SeedancePrompts;
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as SeedancePrompts;
    throw new Error('Could not parse Gemini response as JSON');
  }
}
