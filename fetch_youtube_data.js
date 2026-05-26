// n8n Code Node: Fetch Video Data
// Extracts video title and transcript/caption from YouTube or Instagram Reel URLs
const results = [];
for (const item of $input.all()) {
  const sourceUrl = item.json.source_url;

  // Detect source type
  let sourceType = '';
  if (sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be')) {
    sourceType = 'youtube';
  } else if (sourceUrl.includes('instagram.com/reel') || sourceUrl.includes('instagram.com/p/')) {
    sourceType = 'instagram';
  }

  if (!sourceType) {
    results.push({
      json: {
        source_url: sourceUrl,
        source_type: 'unknown',
        video_id: '',
        title: 'ERROR: Unsupported URL. Use a YouTube or Instagram Reel link.',
        transcript: '',
        thumbnail_url: '',
        thumbnail_base64: '',
        aspect_ratio: '16:9',
      },
    });
    continue;
  }

  // ===== YOUTUBE =====
  if (sourceType === 'youtube') {
    let videoId = '';
    if (sourceUrl.includes('v=')) {
      videoId = sourceUrl.split('v=')[1].split('&')[0];
    } else if (sourceUrl.includes('youtu.be/')) {
      videoId = sourceUrl.split('youtu.be/')[1].split('?')[0];
    } else if (sourceUrl.includes('/shorts/')) {
      videoId = sourceUrl.split('/shorts/')[1].split('?')[0];
    }

    if (!videoId) {
      results.push({
        json: {
          source_url: sourceUrl,
          source_type: 'youtube',
          video_id: '',
          title: 'ERROR: Invalid YouTube URL',
          transcript: '',
          thumbnail_url: '',
          thumbnail_base64: '',
          aspect_ratio: '16:9',
        },
      });
      continue;
    }

    // Get title via oEmbed
    let title = '';
    try {
      const oembedResp = await this.helpers.httpRequest({
        method: 'GET',
        url: 'https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=' + videoId,
      });
      const oembedData = typeof oembedResp === 'string' ? JSON.parse(oembedResp) : oembedResp;
      title = oembedData.title || '';
    } catch (e) {
      title = 'Untitled Video';
    }

    // Fetch YouTube page to find captions
    let transcript = '';
    try {
      const page = await this.helpers.httpRequest({
        method: 'GET',
        url: 'https://www.youtube.com/watch?v=' + videoId,
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const pageStr = typeof page === 'string' ? page : JSON.stringify(page);

      const captionRegex = /"captionTracks":\[\{"baseUrl":"([^"]+)"/;
      const captionMatch = pageStr.match(captionRegex);

      if (captionMatch && captionMatch[1]) {
        const captionUrl = captionMatch[1].replace(/\\u0026/g, '&');
        const capsResp = await this.helpers.httpRequest({
          method: 'GET',
          url: captionUrl + '&fmt=json3',
        });
        const capsData = typeof capsResp === 'string' ? JSON.parse(capsResp) : capsResp;
        const events = capsData.events || [];

        transcript = events
          .filter(function (ev) { return ev.segs; })
          .map(function (ev) { return ev.segs.map(function (s) { return s.utf8; }).join(''); })
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      if (!transcript) {
        const descRegex = /"shortDescription":"((?:[^"\\]|\\.)*)"/;
        const descMatch = pageStr.match(descRegex);
        if (descMatch && descMatch[1]) {
          transcript = descMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim();
        }
      }

      if (!transcript) {
        transcript = 'No transcript or description available. Analyze based on the title only.';
      }
    } catch (e) {
      transcript = 'Could not fetch transcript. Analyze based on the title only.';
    }

    // Fetch thumbnail as base64
    let thumbBase64 = '';
    let thumbUrl = 'https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg';
    try {
      const thumbResp = await this.helpers.httpRequest({ method: 'GET', url: thumbUrl, encoding: 'arraybuffer', returnFullResponse: true });
      thumbBase64 = Buffer.from(thumbResp.body).toString('base64');
    } catch (e) {
      try {
        thumbUrl = 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
        const thumbResp2 = await this.helpers.httpRequest({ method: 'GET', url: thumbUrl, encoding: 'arraybuffer', returnFullResponse: true });
        thumbBase64 = Buffer.from(thumbResp2.body).toString('base64');
      } catch (e2) { thumbBase64 = ''; }
    }

    results.push({
      json: {
        source_url: sourceUrl,
        source_type: 'youtube',
        video_id: videoId,
        title: title,
        transcript: transcript,
        thumbnail_url: thumbUrl,
        thumbnail_base64: thumbBase64,
        aspect_ratio: '16:9',
      },
    });
  }

  // ===== INSTAGRAM =====
  if (sourceType === 'instagram') {
    // Extract shortcode from URL
    let shortcode = '';
    const reelMatch = sourceUrl.match(/instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/);
    if (reelMatch && reelMatch[1]) {
      shortcode = reelMatch[1];
    }

    if (!shortcode) {
      results.push({
        json: {
          source_url: sourceUrl,
          source_type: 'instagram',
          video_id: '',
          title: 'ERROR: Invalid Instagram URL',
          transcript: '',
          thumbnail_url: '',
          thumbnail_base64: '',
          aspect_ratio: '9:16',
        },
      });
      continue;
    }

    let title = '';
    let thumbUrl = '';
    let thumbBase64 = '';
    let transcript = '';

    // Try Instagram oEmbed API (works for public posts, no auth needed)
    try {
      const oembedResp = await this.helpers.httpRequest({
        method: 'GET',
        url: 'https://api.instagram.com/oembed/?url=' + encodeURIComponent(sourceUrl) + '&format=json',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const oembedData = typeof oembedResp === 'string' ? JSON.parse(oembedResp) : oembedResp;
      title = oembedData.title || '';
      thumbUrl = oembedData.thumbnail_url || '';
      const authorName = oembedData.author_name || '';
      if (!title && authorName) {
        title = 'Instagram Reel by ' + authorName;
      }
    } catch (e) {
      // oEmbed failed, try page scraping fallback
    }

    // Fallback: scrape the page for og: meta tags
    if (!title || !thumbUrl) {
      try {
        const page = await this.helpers.httpRequest({
          method: 'GET',
          url: sourceUrl,
          headers: {
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        const pageStr = typeof page === 'string' ? page : JSON.stringify(page);

        if (!title) {
          const ogTitleMatch = pageStr.match(/property="og:title"\s+content="([^"]+)"/);
          if (ogTitleMatch && ogTitleMatch[1]) {
            title = ogTitleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
          }
        }

        if (!thumbUrl) {
          const ogImageMatch = pageStr.match(/property="og:image"\s+content="([^"]+)"/);
          if (ogImageMatch && ogImageMatch[1]) {
            thumbUrl = ogImageMatch[1].replace(/&amp;/g, '&');
          }
        }

        if (!title) {
          const descMatch = pageStr.match(/property="og:description"\s+content="([^"]+)"/);
          if (descMatch && descMatch[1]) {
            title = descMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
          }
        }
      } catch (e) {
        // Page scraping also failed
      }
    }

    if (!title) {
      title = 'Instagram Reel ' + shortcode;
    }

    // Use the caption/title as the transcript (Reels don't have separate transcripts)
    transcript = title || 'No caption available. Analyze based on the thumbnail only.';

    // Fetch thumbnail as base64
    if (thumbUrl) {
      try {
        const thumbResp = await this.helpers.httpRequest({
          method: 'GET',
          url: thumbUrl,
          encoding: 'arraybuffer',
          returnFullResponse: true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        thumbBase64 = Buffer.from(thumbResp.body).toString('base64');
      } catch (e) {
        thumbBase64 = '';
      }
    }

    results.push({
      json: {
        source_url: sourceUrl,
        source_type: 'instagram',
        video_id: shortcode,
        title: title,
        transcript: transcript,
        thumbnail_url: thumbUrl,
        thumbnail_base64: thumbBase64,
        aspect_ratio: '9:16',
      },
    });
  }
}
return results;
