import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const GEMINI_KEY = 'AIzaSyDGs6effDaTvVzlnxKitiqE366r20lAfQQ';
const S = 'https://docs.google.com/spreadsheets/d/1wIh6AcVKWvef4NANk_c5a9jRiZ5gxrnBSHKdDB1yfc0/edit?gid=0#gid=0';
const SEEDANCE_URL = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
const SEEDANCE_MODEL = 'doubao-seedance-2-0-260128';

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
      jsCode: 'const results = [];\nfor (const item of $input.all()) {\n  const url = item.json.source_url;\n  let sourceType = "";\n  if (url.includes("youtube.com") || url.includes("youtu.be")) sourceType = "youtube";\n  else if (url.includes("instagram.com/reel") || url.includes("instagram.com/p/")) sourceType = "instagram";\n  if (!sourceType) { results.push({json:{source_url:url,source_type:"unknown",video_id:"",title:"ERROR: Unsupported URL",transcript:"",duration_seconds:0,thumbnail_base64:"",storyboard_images:[],aspect_ratio:"16:9"}}); continue; }\n  if (sourceType === "youtube") {\n    let vid = "";\n    if (url.includes("v=")) vid = url.split("v=")[1].split("&")[0];\n    else if (url.includes("youtu.be/")) vid = url.split("youtu.be/")[1].split("?")[0];\n    else if (url.includes("/shorts/")) vid = url.split("/shorts/")[1].split("?")[0];\n    if (!vid) { results.push({json:{source_url:url,source_type:"youtube",video_id:"",title:"ERROR: Invalid YouTube URL",transcript:"",duration_seconds:0,thumbnail_base64:"",storyboard_images:[],aspect_ratio:"16:9"}}); continue; }\n    let title = "";\n    try { const r = await this.helpers.httpRequest({method:"GET",url:"https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v="+vid}); title = (typeof r==="string"?JSON.parse(r):r).title||""; } catch(e) { title="Untitled Video"; }\n    let transcript = ""; let duration_seconds = 0; let playerData = null;\n    try {\n      const playerResp = await this.helpers.httpRequest({ method: "POST", url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ videoId: vid, context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" } } }) });\n      playerData = typeof playerResp === "string" ? JSON.parse(playerResp) : playerResp;\n      duration_seconds = parseInt(playerData?.videoDetails?.lengthSeconds || "0", 10);\n      const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;\n      if (captionTracks && captionTracks.length > 0) { const enTrack = captionTracks.find(t => t.languageCode === "en") || captionTracks[0]; const capsResp = await this.helpers.httpRequest({method:"GET",url:enTrack.baseUrl+"&fmt=json3"}); const capsData = typeof capsResp === "string" ? JSON.parse(capsResp) : capsResp; transcript = (capsData.events||[]).filter(e=>e.segs).map(e=>e.segs.map(s=>s.utf8).join("")).join(" ").replace(/\\s+/g," ").trim(); }\n      if (!transcript) { const desc = playerData?.videoDetails?.shortDescription; if (desc && desc.length > 10) transcript = desc; }\n      if (!transcript) transcript = "No transcript available.";\n    } catch(e) { transcript = "No transcript available."; }\n    results.push({json:{source_url:url,source_type:"youtube",video_id:vid,title,transcript,duration_seconds,thumbnail_base64:"",storyboard_images:[],aspect_ratio:"16:9"}});\n  }\n  if (sourceType === "instagram") {\n    const reelMatch = url.match(/instagram\\.com\\/(?:reel|reels|p)\\/([A-Za-z0-9_-]+)/);\n    const shortcode = reelMatch ? reelMatch[1] : "";\n    if (!shortcode) { results.push({json:{source_url:url,source_type:"instagram",video_id:"",title:"ERROR: Invalid Instagram URL",transcript:"",duration_seconds:0,thumbnail_base64:"",storyboard_images:[],aspect_ratio:"9:16"}}); continue; }\n    let title = "";\n    try {\n      const oembedResp = await this.helpers.httpRequest({method:"GET",url:"https://api.instagram.com/oembed/?url="+encodeURIComponent(url)+"&format=json",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}});\n      const oembedData = typeof oembedResp === "string" ? JSON.parse(oembedResp) : oembedResp;\n      title = oembedData.title || "";\n      if (!title && oembedData.author_name) title = "Instagram Reel by " + oembedData.author_name;\n    } catch(e) {}\n    if (!title) title = "Instagram Reel " + shortcode;\n    results.push({json:{source_url:url,source_type:"instagram",video_id:shortcode,title:title,transcript:title||"No caption available.",duration_seconds:0,thumbnail_base64:"",storyboard_images:[],aspect_ratio:"9:16"}});\n  }\n}\nreturn results;'
    },
    position: [250, 300]
  },
  output: [{ source_url: '', source_type: 'youtube', video_id: 'test', title: 'Test', transcript: 'test', duration_seconds: 30, aspect_ratio: '16:9' }]
});

const buildAnalysis = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Analysis Request',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const items = $input.all(); const results = [];\nfor (const item of items) {\n  const title = item.json.title || ""; const transcript = item.json.transcript || "";\n  const duration = item.json.duration_seconds || 30;\n  const aspectRatio = item.json.aspect_ratio || "16:9";\n  const clipDuration = 10;\n  const totalClips = Math.max(5, Math.ceil(Math.max(45, duration) / clipDuration));\n  const systemText = "You are an expert cinematic ad director specializing in Seedance 2.0 AI video generation. Analyze this video ad and create " + totalClips + " highly detailed, sequential scene prompts that together tell ONE connected story. Each prompt describes a unique " + clipDuration + "-second clip that visually continues from the last frame of the previous clip. CRITICAL RULES: 1) TWO CONSISTENT ASIAN CHARACTERS - There are exactly two characters who appear throughout ALL clips: Character A is a young East Asian WOMAN with straight black hair (specify exact style: bob, ponytail, etc.), warm light skin tone, almond-shaped eyes, and a specific outfit described consistently in every prompt. Character B is a young East Asian MAN with short straight dark hair, warm light skin tone, almond-shaped eyes, and a specific outfit described consistently in every prompt. Both characters must be described in full detail in every prompt. 2) FILL THE FULL 10 SECONDS WITH MOVEMENT - Every prompt must describe enough continuous action and motion to naturally last 10 seconds. Do NOT write static or posed shots. Describe a sequence of movements that unfolds over time: what happens at the START of the clip, what develops in the MIDDLE, and how it ends. Include both CHARACTER MOVEMENT (walking, turning, reaching, reacting, shifting weight, picking up objects) and CAMERA MOVEMENT (slowly pushing in, pulling back, panning left to right, tracking alongside, rising upward, circling around). A clip should feel like a mini scene with a beginning, middle, and end. 3) DYNAMIC MOTION OVER STATIC SHOTS - Avoid describing a single frozen moment or one close-up held for the duration. Instead describe evolving action: characters move through space, change position, interact physically, and the camera follows or reveals. Use motion verbs throughout: strides, spins, leans in, reaches across, steps back, tilts head, turns around, glances up, walks toward. 4) CONNECTED NARRATIVE - The clips must flow as one continuous story. What happens at the END of one clip must directly lead into the START of the next. Describe where the characters are relative to each other — who is in frame, who moves, how they interact or react. 5) NO DIALOGUE, NO SPEECH BUBBLES, NO TEXT ON SCREEN - All storytelling must be purely visual through action, expression, and body language. 6) DISTINCT CAMERA MOVEMENTS - Every prompt must use a different camera behavior. Rotate through: slow push-in tracking shot, wide pull-back reveal, lateral tracking alongside character, low-angle rising shot, over-the-shoulder following shot, circular arc around both characters. 7) MATCH LOCATIONS FROM THE VIDEO - Recreate the exact settings and environments seen in the original video. Describe the environment precisely: surfaces, textures, colors, props, lighting conditions, and atmosphere as they appear in the video. 8) CONSISTENT CHARACTERS - same outfits, same hair, same appearance for both characters throughout. 9) STYLE: photorealistic, 4K ultra-HD, cinematic lighting, 24fps, subtle film grain, smooth motion blur. 10) 180-220 words per prompt, one flowing paragraph, no bullet points. 11) No negatives, no audio cues. Output ONLY valid JSON: {\\"video_description\\": \\"summary\\", \\"prompts\\": [\\"scene1 prompt\\", \\"scene2 prompt\\", ...]}";\n  const userText = "ANALYZE THIS AD AND CREATE " + totalClips + " SEQUENTIAL SCENE PROMPTS. Title: " + title + " Transcript: " + transcript.substring(0, 3000) + " Duration: " + duration + "s.";\n  const body = { contents: [{ role: "user", parts: [{ text: userText }] }], systemInstruction: { parts: [{ text: systemText }] }, generationConfig: { temperature: 0.3 } };\n  results.push({ json: { source_url: item.json.source_url || "", title: title, gemini_body: JSON.stringify(body), aspect_ratio: aspectRatio, source_type: item.json.source_type || "youtube", total_clips: totalClips, clip_duration: clipDuration } });\n}\nreturn results;'
    },
    position: [500, 300]
  },
  output: [{ source_url: '', title: '', gemini_body: '{}', aspect_ratio: '16:9', total_clips: 5, clip_duration: 10 }]
});

const geminiAnalysis = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Gemini: Scene Prompts',
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

const prepareState = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Seedance State',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const srcData = $("Build Analysis Request").first().json;\nconst response = $input.first().json;\nlet text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";\ntext = text.replace(/[\\x00-\\x1F\\x7F]/g, " ");\nlet parsed;\ntry { parsed = JSON.parse(text); } catch(e) {\n  const m = text.match(/\\{[\\s\\S]*\\}/);\n  try { parsed = m ? JSON.parse(m[0]) : {}; } catch(e2) { parsed = {}; }\n}\nconst prompts = parsed.prompts || ["A cinematic product advertisement, photorealistic, 4K, cinematic lighting"];\nconst totalClips = srcData.total_clips || 5;\nwhile (prompts.length < totalClips) {\n  prompts.push(prompts[prompts.length - 1]);\n}\nreturn [{json: {\n  source_url: srcData.source_url || "",\n  title: srcData.title || "",\n  aspect_ratio: srcData.aspect_ratio || "16:9",\n  source_type: srcData.source_type || "youtube",\n  all_prompts: JSON.stringify(prompts),\n  current_clip: 0,\n  total_clips: totalClips,\n  clip_duration: srcData.clip_duration || 10,\n  last_video_url: "",\n  all_video_urls: "[]",\n  video_description: parsed.video_description || "",\n  poll_count: 0\n}}];'
    },
    position: [1000, 300]
  },
  output: [{ source_url: '', title: '', all_prompts: '[]', current_clip: 0, total_clips: 5, clip_duration: 10, last_video_url: '', all_video_urls: '[]', video_description: '', poll_count: 0 }]
});

const buildSeedanceRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Seedance Request',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const item = $input.first().json;\nconst currentClip = Number(item.current_clip) || 0;\nconst allPrompts = JSON.parse(item.all_prompts || "[]");\nconst prompt = allPrompts[currentClip] || "A cinematic product scene, photorealistic, 4K";\nconst lastVideoUrl = item.last_video_url || "";\nconst clipDuration = item.clip_duration || 10;\nconst content = [{ type: "text", text: prompt }];\nif (lastVideoUrl) {\n  content.push({ type: "video_url", video_url: { url: lastVideoUrl } });\n}\nconst requestBody = { model: "' + SEEDANCE_MODEL + '", content: content, duration: clipDuration, generate_audio: false, watermark: false };\nreturn [{json: {\n  source_url: item.source_url || "",\n  title: item.title || "",\n  aspect_ratio: item.aspect_ratio || "16:9",\n  source_type: item.source_type || "youtube",\n  all_prompts: item.all_prompts || "[]",\n  current_clip: currentClip,\n  total_clips: item.total_clips || 5,\n  clip_duration: clipDuration,\n  last_video_url: lastVideoUrl,\n  all_video_urls: item.all_video_urls || "[]",\n  video_description: item.video_description || "",\n  seedance_request_body: JSON.stringify(requestBody),\n  current_prompt: prompt,\n  poll_count: 0\n}}];'
    },
    position: [1250, 300]
  },
  output: [{ seedance_request_body: '{}', current_clip: 0, total_clips: 5, current_prompt: '', poll_count: 0 }]
});

const postSeedance = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'POST Seedance Generate',
    parameters: {
      method: 'POST',
      url: SEEDANCE_URL,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ $json.seedance_request_body }}'),
      options: { response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } }, timeout: 60000 }
    },
    credentials: { httpHeaderAuth: newCredential('Seedance API') },
    position: [1500, 300]
  },
  output: [{ body: { id: 'task-123' }, statusCode: 200 }]
});

const captureTaskId = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Capture Task ID',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const postResp = $input.first().json;\nconst buildData = $("Build Seedance Request").first().json;\nconst taskId = postResp.body?.id || postResp.id || "";\nif (!taskId) { throw new Error("Seedance API error: " + JSON.stringify(postResp.body || postResp).substring(0, 1000)); }\nreturn [{json: {\n  task_id: taskId,\n  source_url: buildData.source_url || "",\n  title: buildData.title || "",\n  aspect_ratio: buildData.aspect_ratio || "16:9",\n  source_type: buildData.source_type || "youtube",\n  all_prompts: buildData.all_prompts || "[]",\n  current_clip: buildData.current_clip || 0,\n  total_clips: buildData.total_clips || 5,\n  clip_duration: buildData.clip_duration || 10,\n  last_video_url: buildData.last_video_url || "",\n  all_video_urls: buildData.all_video_urls || "[]",\n  video_description: buildData.video_description || "",\n  current_prompt: buildData.current_prompt || "",\n  poll_count: 0\n}}];'
    },
    position: [1750, 300]
  },
  output: [{ task_id: 'task-123', source_url: '', current_clip: 0, total_clips: 5, poll_count: 0 }]
});

const waitNode = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait 60s',
    parameters: { amount: 60, unit: 'seconds' },
    position: [2000, 300]
  },
  output: [{}]
});

const trackPoll = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Track Poll Count',
    parameters: {
      mode: 'manual',
      assignments: { assignments: [
        { id: 'pc', name: 'poll_count', value: expr('{{ ($json.poll_count || 0) + 1 }}'), type: 'number' },
        { id: 'ti', name: 'task_id', value: expr('{{ $("Capture Task ID").item.json.task_id }}'), type: 'string' },
        { id: 'su', name: 'source_url', value: expr('{{ $("Capture Task ID").item.json.source_url }}'), type: 'string' },
        { id: 'tt', name: 'title', value: expr('{{ $("Capture Task ID").item.json.title }}'), type: 'string' },
        { id: 'ar', name: 'aspect_ratio', value: expr('{{ $("Capture Task ID").item.json.aspect_ratio }}'), type: 'string' },
        { id: 'st', name: 'source_type', value: expr('{{ $("Capture Task ID").item.json.source_type }}'), type: 'string' },
        { id: 'ap', name: 'all_prompts', value: expr('{{ $("Capture Task ID").item.json.all_prompts }}'), type: 'string' },
        { id: 'cc', name: 'current_clip', value: expr('{{ $("Capture Task ID").item.json.current_clip }}'), type: 'number' },
        { id: 'tc', name: 'total_clips', value: expr('{{ $("Capture Task ID").item.json.total_clips }}'), type: 'number' },
        { id: 'cd', name: 'clip_duration', value: expr('{{ $("Capture Task ID").item.json.clip_duration }}'), type: 'number' },
        { id: 'lv', name: 'last_video_url', value: expr('{{ $("Capture Task ID").item.json.last_video_url }}'), type: 'string' },
        { id: 'av', name: 'all_video_urls', value: expr('{{ $("Capture Task ID").item.json.all_video_urls }}'), type: 'string' },
        { id: 'vd', name: 'video_description', value: expr('{{ $("Capture Task ID").item.json.video_description }}'), type: 'string' },
        { id: 'cp', name: 'current_prompt', value: expr('{{ $("Capture Task ID").item.json.current_prompt }}'), type: 'string' }
      ]},
      includeOtherFields: false
    },
    position: [2250, 300]
  },
  output: [{ poll_count: 1, task_id: 'task-123' }]
});

const maxRetriesCheck = ifElse({
  version: 2.3,
  config: {
    name: 'Max Retries (10)?',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.poll_count }}'), rightValue: 10, operator: { type: 'number', operation: 'gte' } }]
      }
    },
    position: [2500, 300]
  }
});

const getSeedanceStatus = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Seedance Status',
    parameters: {
      method: 'GET',
      url: expr('{{ "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/" + $json.task_id }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { response: { response: { neverError: true, responseFormat: 'json' } }, timeout: 30000 }
    },
    credentials: { httpHeaderAuth: newCredential('Seedance API') },
    position: [2750, 300]
  },
  output: [{ status: 'succeeded', content: { video_url: 'https://example.com/video.mp4' } }]
});

const doneCheck = ifElse({
  version: 2.3,
  config: {
    name: 'Task Done?',
    parameters: {
      conditions: {
        combinator: 'or',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ $json.status }}'), rightValue: 'succeeded', operator: { type: 'string', operation: 'equals' } },
          { leftValue: expr('{{ $json.status }}'), rightValue: 'failed', operator: { type: 'string', operation: 'equals' } }
        ]
      }
    },
    position: [3000, 300]
  }
});

const processResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Process & Check Extension',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const item = $input.first().json;\nconst state = $("Track Poll Count").first().json;\nif (item.status === "failed") {\n  const errMsg = item.error?.message || item.status_reason || "Generation failed";\n  return [{json: { source_url: state.source_url || "", title: state.title || "", needs_extension: false, last_video_url: "", all_video_urls: state.all_video_urls || "[]", error: errMsg, status: "failed_clip_" + (state.current_clip || 0), video_description: state.video_description || "", current_prompt: state.current_prompt || "" }}];\n}\nlet videoUrl = "";\ntry {\n  const r = item;\n  if (r.content && typeof r.content === "object" && !Array.isArray(r.content)) { videoUrl = r.content.video_url || r.content.url || ""; }\n  if (!videoUrl && Array.isArray(r.content)) { for (const c of r.content) { if (c.video_url) { videoUrl = c.video_url; break; } if (c.url) { videoUrl = c.url; break; } } }\n  if (!videoUrl && r.output) videoUrl = r.output.video_url || r.output.url || "";\n  if (!videoUrl && r.video_url) videoUrl = r.video_url;\n  if (!videoUrl && r.result) videoUrl = r.result.video_url || r.result.url || "";\n  if (!videoUrl) { const jsonStr = JSON.stringify(r); const urlMatch = jsonStr.match(/"(?:video_url|url|download_url|file_url)":"(https?:\\/\\/[^"]+)"/i); if (urlMatch) videoUrl = urlMatch[1]; }\n} catch(e) { videoUrl = ""; }\nif (!videoUrl) {\n  return [{json: { source_url: state.source_url || "", title: state.title || "", needs_extension: false, last_video_url: "", all_video_urls: state.all_video_urls || "[]", error: "No video URL in response: " + JSON.stringify(item).substring(0, 500), status: "failed_no_url_clip_" + (state.current_clip || 0), video_description: state.video_description || "", current_prompt: state.current_prompt || "" }}];\n}\nconst currentClip = state.current_clip || 0;\nconst totalClips = state.total_clips || 5;\nconst existingUrls = JSON.parse(state.all_video_urls || "[]");\nexistingUrls.push(videoUrl);\nconst needsMore = (currentClip + 1) < totalClips;\nif (needsMore) {\n  return [{json: {\n    source_url: state.source_url || "",\n    title: state.title || "",\n    aspect_ratio: state.aspect_ratio || "16:9",\n    source_type: state.source_type || "youtube",\n    all_prompts: state.all_prompts || "[]",\n    current_clip: currentClip + 1,\n    total_clips: totalClips,\n    clip_duration: state.clip_duration || 10,\n    last_video_url: videoUrl,\n    all_video_urls: JSON.stringify(existingUrls),\n    video_description: state.video_description || "",\n    needs_extension: true,\n    error: "",\n    status: "clip_" + (currentClip + 1) + "_of_" + totalClips,\n    poll_count: 0\n  }}];\n} else {\n  return [{json: {\n    source_url: state.source_url || "",\n    title: state.title || "",\n    needs_extension: false,\n    last_video_url: videoUrl,\n    all_video_urls: JSON.stringify(existingUrls),\n    error: "",\n    status: "completed",\n    video_description: state.video_description || "",\n    current_prompt: state.current_prompt || ""\n  }}];\n}'
    },
    position: [3250, 300]
  },
  output: [{ needs_extension: false, last_video_url: '', all_video_urls: '[]', status: 'completed' }]
});

const needMoreCheck = ifElse({
  version: 2.3,
  config: {
    name: 'Need More Clips?',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.needs_extension }}'), rightValue: true, operator: { type: 'boolean', operation: 'true' } }]
      }
    },
    position: [3500, 300]
  }
});

const prepareSheet = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Final Result',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const d = $input.first().json;\nconst allUrls = JSON.parse(d.all_video_urls || "[]");\nreturn [{json: {\n  source_url: String(d.source_url || ""),\n  video_title: String(d.title || ""),\n  transcript: "",\n  veo_prompt: String(d.current_prompt || d.video_description || ""),\n  video_url: String(allUrls.join(" | ") || ""),\n  status: String(d.error ? "failed" : "completed_" + allUrls.length + "_clips"),\n  error: String(d.error || ""),\n  completed_at: new Date().toISOString(),\n  storyboard: String(d.video_description || "")\n}}];'
    },
    position: [3750, 500]
  },
  output: [{ source_url: '', video_title: '', video_url: '', status: 'completed' }]
});

const sheetResult = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Sheet: Update Result',
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
    position: [4000, 500]
  },
  output: [{}]
});

const prepareTimeout = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Timeout',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const d = $json;\nreturn [{json: {\n  source_url: String(d.source_url || ""),\n  video_title: String(d.title || ""),\n  transcript: "",\n  veo_prompt: String(d.current_prompt || ""),\n  video_url: "",\n  status: "timeout_clip_" + (d.current_clip || 0),\n  error: "Timeout after 10 polls (~10 min)",\n  completed_at: new Date().toISOString(),\n  storyboard: ""\n}}];'
    },
    position: [2750, 100]
  },
  output: [{ source_url: '', status: 'timeout' }]
});

const sheetTimeout = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Sheet: Update Timeout',
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
    position: [3000, 100]
  },
  output: [{}]
});

export default workflow('seedance2-pipeline', 'Video Ad to Seedance 2.0 Pipeline')
  .add(sheetTrigger)
  .to(fetchVideoData)
  .to(buildAnalysis)
  .to(geminiAnalysis)
  .to(prepareState)
  .to(buildSeedanceRequest)
  .to(postSeedance)
  .to(captureTaskId)
  .to(waitNode)
  .to(trackPoll)
  .to(maxRetriesCheck
    .onTrue(prepareTimeout.to(sheetTimeout))
    .onFalse(getSeedanceStatus.to(doneCheck
      .onTrue(processResult.to(needMoreCheck
        .onTrue(buildSeedanceRequest)
        .onFalse(prepareSheet.to(sheetResult))
      ))
      .onFalse(waitNode)
    ))
  );
