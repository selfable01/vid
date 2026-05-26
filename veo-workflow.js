import { workflow, node, trigger, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const K = 'AIzaSyAWWc4W-ZYeL6DF-8ZT6wXGPjh44vnO9SQ';
const S = 'https://docs.google.com/spreadsheets/d/1wIh6AcVKWvef4NANk_c5a9jRiZ5gxrnBSHKdDB1yfc0/edit?gid=0#gid=0';
const G = 'https://generativelanguage.googleapis.com/v1beta';

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
      jsCode: 'const results = [];\nfor (const item of $input.all()) {\n  const url = item.json.source_url;\n  let sourceType = "";\n  if (url.includes("youtube.com") || url.includes("youtu.be")) sourceType = "youtube";\n  else if (url.includes("instagram.com/reel") || url.includes("instagram.com/p/")) sourceType = "instagram";\n  if (!sourceType) { results.push({json:{source_url:url,source_type:"unknown",video_id:"",title:"ERROR: Unsupported URL",transcript:"",duration_seconds:0,thumbnail_base64:"",storyboard_images:[],aspect_ratio:"16:9"}}); continue; }\n  if (sourceType === "youtube") {\n    let vid = "";\n    if (url.includes("v=")) vid = url.split("v=")[1].split("&")[0];\n    else if (url.includes("youtu.be/")) vid = url.split("youtu.be/")[1].split("?")[0];\n    else if (url.includes("/shorts/")) vid = url.split("/shorts/")[1].split("?")[0];\n    if (!vid) { results.push({json:{source_url:url,source_type:"youtube",video_id:"",title:"ERROR: Invalid YouTube URL",transcript:"",duration_seconds:0,thumbnail_base64:"",storyboard_images:[],aspect_ratio:"16:9"}}); continue; }\n    let title = "";\n    try { const r = await this.helpers.httpRequest({method:"GET",url:"https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v="+vid}); title = (typeof r==="string"?JSON.parse(r):r).title||""; } catch(e) { title="Untitled Video"; }\n    let transcript = ""; let duration_seconds = 0; let playerData = null;\n    try {\n      const playerResp = await this.helpers.httpRequest({ method: "POST", url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ videoId: vid, context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" } } }) });\n      playerData = typeof playerResp === "string" ? JSON.parse(playerResp) : playerResp;\n      duration_seconds = parseInt(playerData?.videoDetails?.lengthSeconds || "0", 10);\n      const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;\n      if (captionTracks && captionTracks.length > 0) { const enTrack = captionTracks.find(t => t.languageCode === "en") || captionTracks[0]; const capsResp = await this.helpers.httpRequest({method:"GET",url:enTrack.baseUrl+"&fmt=json3"}); const capsData = typeof capsResp === "string" ? JSON.parse(capsResp) : capsResp; transcript = (capsData.events||[]).filter(e=>e.segs).map(e=>e.segs.map(s=>s.utf8).join("")).join(" ").replace(/\\s+/g," ").trim(); }\n      if (!transcript) { const desc = playerData?.videoDetails?.shortDescription; if (desc && desc.length > 10) transcript = desc; }\n      if (!transcript) transcript = "No transcript available.";\n    } catch(e) { transcript = "No transcript available."; }\n    let thumbnail_base64 = "";\n    try { const thumbResp = await this.helpers.httpRequest({ method: "GET", url: "https://img.youtube.com/vi/" + vid + "/maxresdefault.jpg", encoding: "arraybuffer", returnFullResponse: true }); thumbnail_base64 = Buffer.from(thumbResp.body).toString("base64"); } catch(e) { try { const thumbResp2 = await this.helpers.httpRequest({ method: "GET", url: "https://img.youtube.com/vi/" + vid + "/hqdefault.jpg", encoding: "arraybuffer", returnFullResponse: true }); thumbnail_base64 = Buffer.from(thumbResp2.body).toString("base64"); } catch(e2) {} }\n    let storyboard_images = [];\n    try {\n      const sbSpec = playerData?.storyboards?.playerStoryboardSpecRenderer?.spec;\n      if (sbSpec) {\n        const levels = sbSpec.split("|");\n        const levelIdx = Math.min(levels.length - 1, 2);\n        const hp = levels[levelIdx].split("#");\n        const baseUrl = hp[0];\n        const frameCount = parseInt(hp[3]) || 0;\n        const cols = parseInt(hp[4]) || 5;\n        const rows = parseInt(hp[5]) || 5;\n        const sheetCount = Math.ceil(frameCount / (cols * rows));\n        for (let m = 0; m < Math.min(sheetCount, 4); m++) {\n          try {\n            const sbUrl = baseUrl.replace("$M", String(m));\n            const sbResp = await this.helpers.httpRequest({ method: "GET", url: sbUrl, encoding: "arraybuffer", returnFullResponse: true });\n            storyboard_images.push(Buffer.from(sbResp.body).toString("base64"));\n          } catch(e) {}\n        }\n      }\n    } catch(e) {}\n    results.push({json:{source_url:url,source_type:"youtube",video_id:vid,title,transcript,duration_seconds,thumbnail_base64,storyboard_images,aspect_ratio:"16:9"}});\n  }\n  if (sourceType === "instagram") {\n    const reelMatch = url.match(/instagram\\.com\\/(?:reel|reels|p)\\/([A-Za-z0-9_-]+)/);\n    const shortcode = reelMatch ? reelMatch[1] : "";\n    if (!shortcode) { results.push({json:{source_url:url,source_type:"instagram",video_id:"",title:"ERROR: Invalid Instagram URL",transcript:"",duration_seconds:0,thumbnail_base64:"",storyboard_images:[],aspect_ratio:"9:16"}}); continue; }\n    let title = ""; let thumbUrl = ""; let thumbnail_base64 = "";\n    try {\n      const oembedResp = await this.helpers.httpRequest({method:"GET",url:"https://api.instagram.com/oembed/?url="+encodeURIComponent(url)+"&format=json",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}});\n      const oembedData = typeof oembedResp === "string" ? JSON.parse(oembedResp) : oembedResp;\n      title = oembedData.title || "";\n      thumbUrl = oembedData.thumbnail_url || "";\n      if (!title && oembedData.author_name) title = "Instagram Reel by " + oembedData.author_name;\n    } catch(e) {}\n    if (!title) title = "Instagram Reel " + shortcode;\n    if (thumbUrl) { try { const tr = await this.helpers.httpRequest({method:"GET",url:thumbUrl,encoding:"arraybuffer",returnFullResponse:true,headers:{"User-Agent":"Mozilla/5.0"}}); thumbnail_base64 = Buffer.from(tr.body).toString("base64"); } catch(e) {} }\n    results.push({json:{source_url:url,source_type:"instagram",video_id:shortcode,title:title,transcript:title||"No caption available.",duration_seconds:0,thumbnail_base64:thumbnail_base64,storyboard_images:[],aspect_ratio:"9:16"}});\n  }\n}\nreturn results;'
    },
    position: [250, 300]
  },
  output: [{ source_url: 'https://youtube.com/watch?v=test', source_type: 'youtube', video_id: 'test', title: 'Test Video', transcript: 'test transcript', duration_seconds: 30, thumbnail_base64: '', storyboard_images: [], aspect_ratio: '16:9' }]
});

const buildAnalysis = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Veo Analysis Request',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const items = $input.all(); const results = [];\nfor (const item of items) {\n  const title = item.json.title || ""; const transcript = item.json.transcript || ""; const thumb = item.json.thumbnail_base64 || "";\n  const storyboards = item.json.storyboard_images || [];\n  const duration = item.json.duration_seconds || 30;\n  const aspectRatio = item.json.aspect_ratio || "16:9";\n  const targetDuration = Math.max(50, duration);\n  const targetExtensions = Math.ceil((targetDuration - 8) / 7);\n  const totalPrompts = targetExtensions + 1;\n  const systemText = "You are an expert ad creative director and video prompt engineer for Google Veo 3.1. Analyze this video ad and create prompts for video generation with scene extensions. Create exactly " + totalPrompts + " prompts (1 initial + " + targetExtensions + " extensions). INITIAL PROMPT: A detailed 150-250 word prompt for the opening 8 seconds. Include visual style, lighting, color palette with hex codes, setting, character appearance (age, ethnicity as visible, clothing, expression), product details (shape, color, material), and the opening ACTION with the product. Single paragraph. EXTENSION PROMPTS: Array of exactly " + targetExtensions + " prompts, each 80-150 words. Each describes the NEXT 7 seconds, continuing seamlessly. Describe progression of core action, camera movement, emotional shifts, product interaction. RULES: 1) ALL prompts same visual universe (consistent characters, setting, colors, lighting). 2) Focus on CORE ACTION, product being actively USED. 3) Each extension flows naturally from previous. 4) Use motion verbs: presses, glides, rolls, applies, stretches, kneads. 5) End each prompt with: photorealistic, 4K, cinematic lighting, 24fps, shallow depth of field. 6) No negatives. 7) NEVER include dialogue, spoken words, voiceover, narration, or any audio descriptions in prompts. Veo generates audio automatically - describing speech triggers safety filters. Focus ONLY on visual actions. 8) All values plain strings. Output ONLY valid JSON, no markdown fences: {\\"video_description\\": \\"summary\\", \\"core_action\\": \\"main action\\", \\"initial_prompt\\": \\"detailed opening prompt\\", \\"extension_prompts\\": [\\"ext1\\", \\"ext2\\"]}";\n  const userText = "ANALYZE THIS AD AND CREATE VEO 3.1 PROMPTS. Focus on CORE ACTION: what is the person DOING with the product? Title: " + title + " Transcript: " + transcript.substring(0, 3000) + " Duration: " + duration + "s. Create " + totalPrompts + " prompts to recreate as " + targetDuration + "s video.";\n  const parts = [];\n  parts.push({ text: userText });\n  const body = { contents: [{ role: "user", parts: parts }], systemInstruction: { parts: [{ text: systemText }] }, generationConfig: { temperature: 0.3 } };\n  results.push({ json: { source_url: item.json.source_url || "", title: title, gemini_body: JSON.stringify(body), aspect_ratio: aspectRatio, source_type: item.json.source_type || "youtube", target_extensions: targetExtensions, target_duration: targetDuration } });\n}\nreturn results;'
    },
    position: [500, 300]
  },
  output: [{ source_url: '', title: '', gemini_body: '{}', aspect_ratio: '16:9', source_type: 'youtube', target_extensions: 6, target_duration: 50 }]
});

const geminiAnalysis = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Gemini: Veo Prompts',
    parameters: {
      method: 'POST',
      url: G + '/models/gemini-2.5-flash:generateContent?key=AIzaSyDGs6effDaTvVzlnxKitiqE366r20lAfQQ',
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

const prepareVeoState = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Veo State',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const srcData = $("Build Veo Analysis Request").first().json;\nconst response = $input.first().json;\nlet text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";\ntext = text.replace(/[\\x00-\\x1F\\x7F]/g, " ");\nlet parsed;\ntry { parsed = JSON.parse(text); } catch(e) {\n  const m = text.match(/\\{[\\s\\S]*\\}/);\n  try { parsed = m ? JSON.parse(m[0]) : {}; } catch(e2) { parsed = {}; }\n}\nconst initialPrompt = parsed.initial_prompt || "A cinematic product advertisement, photorealistic, 4K, cinematic lighting, 24fps";\nconst extensionPrompts = parsed.extension_prompts || [];\nconst targetExt = srcData.target_extensions || 6;\nwhile (extensionPrompts.length < targetExt) {\n  extensionPrompts.push(extensionPrompts[extensionPrompts.length - 1] || initialPrompt);\n}\nconst allPrompts = [initialPrompt, ...extensionPrompts];\nreturn [{json: {\n  source_url: srcData.source_url || "",\n  title: srcData.title || "",\n  aspect_ratio: srcData.aspect_ratio || "16:9",\n  source_type: srcData.source_type || "youtube",\n  all_prompts: JSON.stringify(allPrompts),\n  current_extension: 0,\n  target_extensions: targetExt,\n  video_base64: "",\n  all_video_uris: "[]",\n  video_description: parsed.video_description || "",\n  poll_count: 0\n}}];'
    },
    position: [1000, 300]
  },
  output: [{ source_url: '', title: '', aspect_ratio: '16:9', source_type: 'youtube', all_prompts: '["prompt"]', current_extension: 0, target_extensions: 6, video_base64: '', all_video_uris: '[]', video_description: '', poll_count: 0 }]
});

const buildVeoRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Veo Request',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const item = $input.first().json;\nconst currentExt = Number(item.current_extension) || 0;\nconst allPrompts = JSON.parse(item.all_prompts || "[]");\nconst prompt = allPrompts[currentExt] || "A cinematic product scene, photorealistic, 4K";\nconst aspectRatio = item.aspect_ratio || "16:9";\nconst requestBody = { instances: [{ prompt: prompt }], parameters: { aspectRatio: aspectRatio, resolution: "720p", personGeneration: "allow_all" } };\nreturn [{json: {\n  source_url: item.source_url || "",\n  title: item.title || "",\n  aspect_ratio: aspectRatio,\n  source_type: item.source_type || "youtube",\n  all_prompts: item.all_prompts || "[]",\n  current_extension: currentExt,\n  target_extensions: item.target_extensions || 6,\n  video_base64: "",\n  all_video_uris: item.all_video_uris || "[]",\n  video_description: item.video_description || "",\n  veo_request_body: JSON.stringify(requestBody),\n  current_prompt: prompt,\n  poll_count: 0\n}}];'
    },
    position: [1250, 300]
  },
  output: [{ source_url: '', title: '', veo_request_body: '{}', current_extension: 0, target_extensions: 6, all_prompts: '[]', all_video_uris: '[]', current_prompt: '', poll_count: 0, aspect_ratio: '16:9', source_type: 'youtube', video_base64: '', video_description: '' }]
});

const postVeo = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'POST Veo Generate',
    parameters: {
      method: 'POST',
      url: G + '/models/veo-3.1-generate-preview:predictLongRunning',
      authentication: 'none',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'x-goog-api-key', value: K }
      ]},
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ $json.veo_request_body }}'),
      options: { response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } }, timeout: 120000 }
    },
    position: [1500, 300]
  },
  output: [{ body: { name: 'operations/123' }, statusCode: 200 }]
});

const captureOp = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Capture Operation',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const postResp = $input.first().json;\nconst buildData = $("Build Veo Request").first().json;\nconst opName = postResp.body?.name || postResp.name || "";\nif (!opName) { throw new Error("Veo API error: " + JSON.stringify(postResp.body || postResp).substring(0, 800) + " | BODY_SENT: " + (buildData.veo_body_preview || "unknown") + " | HAS_INLINE: " + (buildData.veo_body_has_inline || "unknown")); }\nreturn [{json: {\n  operation_name: opName,\n  source_url: buildData.source_url || "",\n  title: buildData.title || "",\n  aspect_ratio: buildData.aspect_ratio || "16:9",\n  source_type: buildData.source_type || "youtube",\n  all_prompts: buildData.all_prompts || "[]",\n  current_extension: buildData.current_extension || 0,\n  target_extensions: buildData.target_extensions || 6,\n  all_video_uris: buildData.all_video_uris || "[]",\n  video_description: buildData.video_description || "",\n  current_prompt: buildData.current_prompt || "",\n  poll_count: 0\n}}];'
    },
    position: [1750, 300]
  },
  output: [{ operation_name: 'operations/123', source_url: '', title: '', current_extension: 0, target_extensions: 6, all_prompts: '[]', all_video_uris: '[]', poll_count: 0, aspect_ratio: '16:9', source_type: 'youtube', video_description: '', current_prompt: '' }]
});

const waitForVeo = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Wait 15s',
    parameters: { amount: 15, unit: 'seconds' },
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
        { id: 'op', name: 'operation_name', value: expr('{{ $("Capture Operation").item.json.operation_name }}'), type: 'string' },
        { id: 'su', name: 'source_url', value: expr('{{ $("Capture Operation").item.json.source_url }}'), type: 'string' },
        { id: 'ti', name: 'title', value: expr('{{ $("Capture Operation").item.json.title }}'), type: 'string' },
        { id: 'ar', name: 'aspect_ratio', value: expr('{{ $("Capture Operation").item.json.aspect_ratio }}'), type: 'string' },
        { id: 'st', name: 'source_type', value: expr('{{ $("Capture Operation").item.json.source_type }}'), type: 'string' },
        { id: 'ap', name: 'all_prompts', value: expr('{{ $("Capture Operation").item.json.all_prompts }}'), type: 'string' },
        { id: 'ce', name: 'current_extension', value: expr('{{ $("Capture Operation").item.json.current_extension }}'), type: 'number' },
        { id: 'te', name: 'target_extensions', value: expr('{{ $("Capture Operation").item.json.target_extensions }}'), type: 'number' },
        { id: 'au', name: 'all_video_uris', value: expr('{{ $("Capture Operation").item.json.all_video_uris }}'), type: 'string' },
        { id: 'vd', name: 'video_description', value: expr('{{ $("Capture Operation").item.json.video_description }}'), type: 'string' },
        { id: 'cp', name: 'current_prompt', value: expr('{{ $("Capture Operation").item.json.current_prompt }}'), type: 'string' }
      ]},
      includeOtherFields: false
    },
    position: [2250, 300]
  },
  output: [{ poll_count: 1, operation_name: 'operations/123', source_url: '', title: '', aspect_ratio: '16:9', source_type: 'youtube', all_prompts: '[]', current_extension: 0, target_extensions: 6, all_video_uris: '[]', video_description: '', current_prompt: '' }]
});

const maxRetriesCheck = ifElse({
  version: 2.3,
  config: {
    name: 'Max Retries (30)?',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.poll_count }}'), rightValue: 30, operator: { type: 'number', operation: 'gte' } }]
      }
    },
    position: [2500, 300]
  }
});

const getVeoStatus = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'GET Veo Status',
    parameters: {
      method: 'GET',
      url: expr('{{ "https://generativelanguage.googleapis.com/v1beta/" + $json.operation_name }}'),
      authentication: 'none',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'x-goog-api-key', value: K }
      ]},
      options: { response: { response: { neverError: true, responseFormat: 'json' } }, timeout: 30000 }
    },
    position: [2750, 300]
  },
  output: [{ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://example.com/video.mp4' } }] } } }]
});

const doneCheck = ifElse({
  version: 2.3,
  config: {
    name: 'Generation Done?',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.done }}'), rightValue: true, operator: { type: 'boolean', operation: 'true' } }]
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
      jsCode: 'const item = $input.first().json;\nconst capturedData = $("Track Poll Count").first().json;\nconst apiKey = "AIzaSyAWWc4W-ZYeL6DF-8ZT6wXGPjh44vnO9SQ";\nif (item.error) {\n  return [{json: { source_url: capturedData.source_url || "", title: capturedData.title || "", needs_extension: false, final_video_url: "", all_video_uris: capturedData.all_video_uris || "[]", error: item.error.message || JSON.stringify(item.error), status: "failed", video_description: capturedData.video_description || "", current_prompt: capturedData.current_prompt || "" }}];\n}\nconst samples = item.response?.generateVideoResponse?.generatedSamples || [];\nconst videoUri = samples[0]?.video?.uri || "";\nif (!videoUri) {\n  return [{json: { source_url: capturedData.source_url || "", title: capturedData.title || "", needs_extension: false, final_video_url: "", all_video_uris: capturedData.all_video_uris || "[]", error: "No video URI: " + JSON.stringify(item).substring(0, 500), status: "failed", video_description: capturedData.video_description || "", current_prompt: capturedData.current_prompt || "" }}];\n}\nconst currentExt = capturedData.current_extension || 0;\nconst targetExt = capturedData.target_extensions || 6;\nconst existingUris = JSON.parse(capturedData.all_video_uris || "[]");\nexistingUris.push(videoUri);\nconst needsMore = currentExt < targetExt;\nif (needsMore) {\n  const videoResp = await this.helpers.httpRequest({ method: "GET", url: videoUri, encoding: "arraybuffer", returnFullResponse: true, headers: { "x-goog-api-key": apiKey } });\n  const videoBase64 = Buffer.from(videoResp.body).toString("base64");\n  return [{json: {\n    source_url: capturedData.source_url || "",\n    title: capturedData.title || "",\n    aspect_ratio: capturedData.aspect_ratio || "16:9",\n    source_type: capturedData.source_type || "youtube",\n    all_prompts: capturedData.all_prompts || "[]",\n    current_extension: currentExt + 1,\n    target_extensions: targetExt,\n    video_base64: videoBase64,\n    all_video_uris: JSON.stringify(existingUris),\n    video_description: capturedData.video_description || "",\n    needs_extension: true,\n    final_video_url: videoUri,\n    error: "",\n    status: "extending_" + (currentExt + 1) + "_of_" + targetExt,\n    poll_count: 0\n  }}];\n} else {\n  return [{json: {\n    source_url: capturedData.source_url || "",\n    title: capturedData.title || "",\n    needs_extension: false,\n    final_video_url: videoUri,\n    all_video_uris: JSON.stringify(existingUris),\n    error: "",\n    status: "completed",\n    video_description: capturedData.video_description || "",\n    current_prompt: capturedData.current_prompt || ""\n  }}];\n}'
    },
    position: [3250, 300]
  },
  output: [{ needs_extension: false, final_video_url: 'https://example.com/video.mp4', all_video_uris: '["url1"]', status: 'completed', source_url: '', title: '', error: '' }]
});

const needMoreCheck = ifElse({
  version: 2.3,
  config: {
    name: 'Need More Extensions?',
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
      jsCode: 'const d = $input.first().json;\nconst allUris = JSON.parse(d.all_video_uris || "[]");\nreturn [{json: {\n  source_url: String(d.source_url || ""),\n  video_title: String(d.title || ""),\n  transcript: "",\n  veo_prompt: String(d.current_prompt || d.video_description || ""),\n  video_url: String(allUris.join(" | ") || ""),\n  status: String(d.error ? "failed" : "completed_" + allUris.length + "_clips"),\n  error: String(d.error || ""),\n  completed_at: new Date().toISOString(),\n  storyboard: String(d.video_description || "")\n}}];'
    },
    position: [3750, 500]
  },
  output: [{ source_url: '', video_title: '', transcript: '', veo_prompt: '', video_url: '', status: 'completed', error: '', completed_at: '', storyboard: '' }]
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
      jsCode: 'const d = $("Track Poll Count").first().json;\nreturn [{json: {\n  source_url: String(d.source_url || ""),\n  video_title: String(d.title || ""),\n  transcript: "",\n  veo_prompt: String(d.current_prompt || ""),\n  video_url: "",\n  status: "timeout_ext_" + (d.current_extension || 0),\n  error: "Timeout after 30 polls (~7.5 min)",\n  completed_at: new Date().toISOString(),\n  storyboard: ""\n}}];'
    },
    position: [2750, 100]
  },
  output: [{ source_url: '', video_title: '', status: 'timeout', error: 'Timeout' }]
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

export default workflow('veo-pipeline', 'Video Ad to Veo 3.1 Pipeline')
  .add(sheetTrigger)
  .to(fetchVideoData)
  .to(buildAnalysis)
  .to(geminiAnalysis)
  .to(prepareVeoState)
  .to(buildVeoRequest)
  .to(postVeo)
  .to(captureOp)
  .to(waitForVeo)
  .to(trackPoll)
  .to(maxRetriesCheck
    .onTrue(prepareTimeout.to(sheetTimeout))
    .onFalse(getVeoStatus.to(doneCheck
      .onTrue(processResult.to(needMoreCheck
        .onTrue(buildVeoRequest)
        .onFalse(prepareSheet.to(sheetResult))
      ))
      .onFalse(waitForVeo)
    ))
  );
