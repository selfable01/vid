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

export interface CinematographyAnalysis {
  subject: string;
  setting: string;
  composition: string;
  camera_movement: string;
  lighting: string;
  color_palette: string;
  texture_and_materials: string;
  scene_progression: string;
  key_moments: string[];
  mood: string;
  recommended_segments: number;
}

export async function analyzeFrames(
  frameBase64s: string[],
  title: string,
  aspectRatio: string
): Promise<CinematographyAnalysis> {
  const parts: object[] = frameBase64s.map(data => ({
    inlineData: { mimeType: 'image/jpeg', data },
  }));

  parts.push({
    text: `Title: ${title}\nAspect Ratio: ${aspectRatio}\n\nThese are ${frameBase64s.length} frames extracted at 1 frame per second from the actual video. Analyze ALL frames to understand the complete visual story. Produce the cinematographic analysis as instructed.`,
  });

  const systemText = `You are an expert cinematographer and visual analyst. Analyze the video frames and output ONLY a valid JSON object (no markdown fences):
{
  "subject": "primary subject(s), their appearance (age, clothing, hair, ethnicity as visible), and evolving actions across all frames",
  "setting": "exact location, time of day, background elements, atmosphere",
  "composition": "shot types used (wide/medium/close-up), angles, framing choices",
  "camera_movement": "specific movements: static/pan/tilt/dolly/handheld/tracking",
  "lighting": "key light direction, color temperature in Kelvin, shadow quality",
  "color_palette": "dominant hues with approximate hex codes, grading style",
  "texture_and_materials": "fabric, skin, surfaces, reflections visible in frames",
  "scene_progression": "how the action evolves from first to last frame",
  "key_moments": ["moment 1", "moment 2", "moment 3", "moment 4"],
  "mood": "emotional register and energy level",
  "recommended_segments": 4
}
Set recommended_segments to 4. Be concrete about what you SEE.`;

  const text = await callGemini({
    contents: [{ role: 'user', parts }],
    systemInstruction: { parts: [{ text: systemText }] },
    generationConfig: { temperature: 0.3 },
  });

  let clean = text.replace(/[\x00-\x1F\x7F]/g, ' ');
  try {
    return JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Could not parse Gemini analysis response');
  }
}

export interface VeoPrompts {
  video_description: string;
  core_action: string;
  initial_prompt: string;
  extension_prompts: string[];
}

export async function generateVeoPrompts(
  analysis: CinematographyAnalysis,
  title: string,
  aspectRatio: string,
  frameCount: number
): Promise<VeoPrompts> {
  const systemText = `You are an expert video prompt engineer for Google Veo 3.1. Create exactly 4 prompts (1 initial + 3 extensions) for a ~32-second video (4 clips × 8 seconds each).

INITIAL PROMPT (opening 8 seconds): 150-250 words, single paragraph. Include: exact subject description (age, clothing, hair, expression), setting, opening action, shot type, lighting with color temperature, color palette with hex codes, texture details.

EXTENSION PROMPTS (3 prompts, each 8 seconds): 100-180 words each. Continue seamlessly — same characters, setting, colors. Describe progression of action, camera movements, emotional development.

RULES:
1. ALL prompts share the same visual universe — consistent appearance, colors, lighting
2. Focus on CORE ACTION — what the subject is actively DOING
3. Use strong motion verbs: glides, reaches, turns, tilts, steps, presses
4. End EVERY prompt with: photorealistic, 4K resolution, cinematic lighting, 24fps, shallow depth of field
5. NEVER include dialogue, voiceover, narration, or audio descriptions
6. No negative phrasing
7. Output ONLY valid JSON, no markdown fences:
{
  "video_description": "2-3 sentence summary",
  "core_action": "the main action",
  "initial_prompt": "detailed opening prompt...",
  "extension_prompts": ["extension 1", "extension 2", "extension 3"]
}`;

  const userText = `Create 4 Veo 3.1 prompts based on this cinematographic analysis:\n\n${JSON.stringify(analysis, null, 2)}\n\nTitle: ${title}\nAspect Ratio: ${aspectRatio}\nFrames analyzed: ${frameCount}\n\nGenerate exactly 4 prompts (1 initial + 3 extensions) for a ~32-second video.`;

  const text = await callGemini({
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    systemInstruction: { parts: [{ text: systemText }] },
    generationConfig: { temperature: 0.3 },
  });

  let clean = text.replace(/[\x00-\x1F\x7F]/g, ' ');
  try {
    return JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Could not parse Gemini prompts response');
  }
}
