import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const GEMINI_KEY = 'AIzaSyDGs6effDaTvVzlnxKitiqE366r20lAfQQ';
const S = 'https://docs.google.com/spreadsheets/d/1wIh6AcVKWvef4NANk_c5a9jRiZ5gxrnBSHKdDB1yfc0/edit?gid=0#gid=0';

const sheetTrigger = trigger({
  type: 'n8n-nodes-base.googleSheetsTrigger',
  version: 1,
  config: {
    name: 'Trigger: New Sheet Row',
    parameters: {
      pollTimes: { item: [{ mode: 'everyMinute' }] },
      documentId: { __rl: true, mode: 'url', value: S },
      sheetName: { __rl: true, mode: 'url', value: S },
      event: 'rowAdded'
    },
    credentials: { googleSheetsTriggerOAuth2Api: newCredential('Google Sheets') },
    position: [0, 300]
  },
  output: [{ source_url: 'https://youtube.com/watch?v=test' }]
});

const fetchVideoData = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Fetch Video Data',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const results = [];\nfor (const item of $input.all()) {\n  const url = item.json.source_url;\n  let sourceType = "";\n  if (url.includes("youtube.com") || url.includes("youtu.be")) sourceType = "youtube";\n  else if (url.includes("instagram.com/reel") || url.includes("instagram.com/p/")) sourceType = "instagram";\n  if (!sourceType) { results.push({json:{source_url:url,source_type:"unknown",video_id:"",title:"ERROR: Unsupported URL",transcript:"",duration_seconds:0,aspect_ratio:"16:9"}}); continue; }\n  if (sourceType === "youtube") {\n    let vid = "";\n    if (url.includes("v=")) vid = url.split("v=")[1].split("&")[0];\n    else if (url.includes("youtu.be/")) vid = url.split("youtu.be/")[1].split("?")[0];\n    else if (url.includes("/shorts/")) vid = url.split("/shorts/")[1].split("?")[0];\n    if (!vid) { results.push({json:{source_url:url,source_type:"youtube",video_id:"",title:"ERROR: Invalid YouTube URL",transcript:"",duration_seconds:0,aspect_ratio:"16:9"}}); continue; }\n    let title = "";\n    try { const r = await this.helpers.httpRequest({method:"GET",url:"https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v="+vid}); title = (typeof r==="string"?JSON.parse(r):r).title||""; } catch(e) { title="Untitled Video"; }\n    let transcript = ""; let duration_seconds = 0;\n    try {\n      const playerResp = await this.helpers.httpRequest({ method: "POST", url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ videoId: vid, context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" } } }) });\n      const playerData = typeof playerResp === "string" ? JSON.parse(playerResp) : playerResp;\n      duration_seconds = parseInt(playerData?.videoDetails?.lengthSeconds || "0", 10);\n      const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;\n      if (captionTracks && captionTracks.length > 0) { const enTrack = captionTracks.find(t => t.languageCode === "en") || captionTracks[0]; const capsResp = await this.helpers.httpRequest({method:"GET",url:enTrack.baseUrl+"&fmt=json3"}); const capsData = typeof capsResp === "string" ? JSON.parse(capsResp) : capsResp; transcript = (capsData.events||[]).filter(e=>e.segs).map(e=>e.segs.map(s=>s.utf8).join("")).join(" ").replace(/\\s+/g," ").trim(); }\n      if (!transcript) { const desc = playerData?.videoDetails?.shortDescription; if (desc && desc.length > 10) transcript = desc; }\n      if (!transcript) transcript = "No transcript available.";\n    } catch(e) { transcript = "No transcript available."; }\n    results.push({json:{source_url:url,source_type:"youtube",video_id:vid,title,transcript,duration_seconds,aspect_ratio:"16:9"}});\n  }\n  if (sourceType === "instagram") {\n    const reelMatch = url.match(/instagram\\.com\\/(?:reel|reels|p)\\/([A-Za-z0-9_-]+)/);\n    const shortcode = reelMatch ? reelMatch[1] : "";\n    if (!shortcode) { results.push({json:{source_url:url,source_type:"instagram",video_id:"",title:"ERROR: Invalid Instagram URL",transcript:"",duration_seconds:0,aspect_ratio:"9:16"}}); continue; }\n    let title = "";\n    try {\n      const oembedResp = await this.helpers.httpRequest({method:"GET",url:"https://api.instagram.com/oembed/?url="+encodeURIComponent(url)+"&format=json",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}});\n      const oembedData = typeof oembedResp === "string" ? JSON.parse(oembedResp) : oembedResp;\n      title = oembedData.title || "";\n      if (!title && oembedData.author_name) title = "Instagram Reel by " + oembedData.author_name;\n    } catch(e) {}\n    if (!title) title = "Instagram Reel " + shortcode;\n    results.push({json:{source_url:url,source_type:"instagram",video_id:shortcode,title:title,transcript:title||"No caption available.",duration_seconds:0,aspect_ratio:"9:16"}});\n  }\n}\nreturn results;'
    },
    position: [250, 300]
  },
  output: [{ source_url: '', source_type: 'youtube', video_id: 'test', title: 'Test', transcript: 'test', duration_seconds: 30, aspect_ratio: '16:9' }]
});

const buildPromptRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Sora Prompt Request',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const items = $input.all(); const results = [];\nfor (const item of items) {\n  const title = item.json.title || ""; const transcript = item.json.transcript || "";\n  const duration = item.json.duration_seconds || 30;\n  const aspectRatio = item.json.aspect_ratio || "16:9";\n  const systemText = "You are an expert AI video prompt engineer specializing in OpenAI Sora. Your task: analyze a source video ad and create ONE extremely detailed, second-by-second prompt for Sora to recreate the most impactful 20 seconds of the ad.\\n\\nSora has a 20-SECOND LIMIT. You must condense the essence of the ad into exactly 20 seconds. Pick the most compelling, high-impact moments.\\n\\nYOUR OUTPUT FORMAT:\\n\\n1. SORA PROMPT (the main prompt to paste into Sora):\\n- Single continuous paragraph, 300-500 words\\n- Describe EVERY second with precise visual detail\\n- Use this structure: [0-2s] opening shot description. [2-5s] next action. [5-8s] next action... up to [18-20s]\\n- Include: camera angle, movement, lighting, colors, textures, character appearance, expressions, product details, hand movements, body positions\\n- Describe the PHYSICAL ACTION in detail: how hands grip the product, how it contacts the body, the motion path, pressure, speed\\n- Include environment: background, surfaces, ambient light direction, depth of field\\n- End with style tags: photorealistic, cinematic, 4K, shallow depth of field, warm/cool tones, film grain\\n\\n2. STORYBOARD BREAKDOWN (for your reference before pasting):\\n- List the key moments you chose and WHY\\n- What was cut from the original and why\\n\\nRULES:\\n- NEVER include dialogue, speech, text overlays, or audio descriptions\\n- NEVER use negative language (no, not, without, dont)\\n- Focus on the CORE ACTION: the product being USED, not just shown\\n- Characters should be described by visible appearance (age range, clothing, expression, ethnicity as visible)\\n- Use motion verbs: presses, glides, sweeps, kneads, applies, rolls, stretches, rotates, lifts\\n- Describe transitions between moments: camera pulls back to reveal, dissolves into, cuts to close-up\\n- The prompt must be self-contained - Sora sees ONLY your text, no images\\n\\nOutput ONLY valid JSON, no markdown fences:\\n{\\n  \\"video_description\\": \\"1-2 sentence summary of the source ad\\",\\n  \\"key_moments_selected\\": \\"why you chose these specific moments from the original\\",\\n  \\"sora_prompt\\": \\"THE COMPLETE SORA PROMPT - single paragraph, 300-500 words, second-by-second [0-2s]...[18-20s]\\",\\n  \\"aspect_ratio\\": \\"16:9 or 9:16\\"\\n}";\n  const userText = "ANALYZE THIS AD AND CREATE A SORA PROMPT. The source video is " + duration + " seconds long, but Sora is limited to 20 seconds. Pick the MOST IMPORTANT and VISUALLY COMPELLING moments to recreate. Title: " + title + "\\n\\nFull Transcript/Description: " + transcript.substring(0, 4000) + "\\n\\nCapture the core selling action, the product in use, and the emotional arc. Compress " + duration + "s into the best possible 20s.";\n  const body = { contents: [{ role: "user", parts: [{ text: userText }] }], systemInstruction: { parts: [{ text: systemText }] }, generationConfig: { temperature: 0.4 } };\n  results.push({ json: { source_url: item.json.source_url || "", title: title, gemini_body: JSON.stringify(body), aspect_ratio: aspectRatio, source_type: item.json.source_type || "youtube", duration_seconds: duration } });\n}\nreturn results;'
    },
    position: [500, 300]
  },
  output: [{ source_url: '', title: '', gemini_body: '{}', aspect_ratio: '16:9' }]
});

const geminiCall = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Gemini: Generate Sora Prompt',
    parameters: {
      method: 'POST',
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY,
      authentication: 'none',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ $json.gemini_body }}'),
      options: { response: { response: { responseFormat: 'json' } }, timeout: 120000 }
    },
    position: [750, 300]
  },
  output: [{ candidates: [{ content: { parts: [{ text: '{}' }] } }] }]
});

const parseAndPrepare = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Sora Prompt',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const srcData = $("Build Sora Prompt Request").first().json;\nconst response = $input.first().json;\nlet text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";\ntext = text.replace(/[\\x00-\\x1F\\x7F]/g, " ");\nlet parsed;\ntry { parsed = JSON.parse(text); } catch(e) {\n  const m = text.match(/\\{[\\s\\S]*\\}/);\n  try { parsed = m ? JSON.parse(m[0]) : {}; } catch(e2) { parsed = {}; }\n}\nconst soraPrompt = parsed.sora_prompt || text;\nconst videoDesc = parsed.video_description || "";\nconst keyMoments = parsed.key_moments_selected || "";\nconst aspectRatio = parsed.aspect_ratio || srcData.aspect_ratio || "16:9";\nreturn [{json: {\n  source_url: String(srcData.source_url || ""),\n  video_title: String(srcData.title || ""),\n  transcript: "",\n  veo_prompt: String(soraPrompt),\n  video_url: "",\n  status: "prompt_ready",\n  error: "",\n  completed_at: new Date().toISOString(),\n  storyboard: String(videoDesc + (keyMoments ? " | KEY MOMENTS: " + keyMoments : "") + " | ASPECT RATIO: " + aspectRatio)\n}}];'
    },
    position: [1000, 300]
  },
  output: [{ source_url: '', video_title: '', veo_prompt: '', status: 'prompt_ready' }]
});

const sheetUpdate = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Sheet: Write Sora Prompt',
    parameters: {
      resource: 'sheet',
      operation: 'appendOrUpdate',
      documentId: { __rl: true, mode: 'url', value: S },
      sheetName: { __rl: true, mode: 'url', value: S },
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['source_url'], schema: [
        { id: 'source_url', displayName: 'source_url', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
        { id: 'video_title', displayName: 'video_title', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'transcript', displayName: 'transcript', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'veo_prompt', displayName: 'veo_prompt', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'video_url', displayName: 'video_url', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'error', displayName: 'error', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'completed_at', displayName: 'completed_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'storyboard', displayName: 'storyboard', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
      ], attemptToConvertTypes: false, convertFieldsToString: false }
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets') },
    position: [1250, 300]
  },
  output: [{}]
});

export default workflow('sora-prompt-pipeline', 'Video Ad to Sora Prompt Pipeline')
  .add(sheetTrigger)
  .to(fetchVideoData)
  .to(buildPromptRequest)
  .to(geminiCall)
  .to(parseAndPrepare)
  .to(sheetUpdate);
