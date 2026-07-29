/**
 * Cloudflare Worker - Google TTS 代理
 * 
 * 部署步骤：
 * 1. 注册 Cloudflare 账号 (cloudflare.com)
 * 2. 进入 Workers & Pages → Create Worker
 * 3. 把这段代码粘贴进去
 * 4. 保存并部署
 * 5. 复制你的 Worker URL (如 https://tts-proxy.your-name.workers.dev)
 * 6. 把 URL 填入应用的 TTS 配置中
 */

export default {
  async fetch(request) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // 从查询参数获取文本
    const url = new URL(request.url);
    const text = url.searchParams.get('q') || url.searchParams.get('text');
    const lang = url.searchParams.get('tl') || 'de';

    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 限制文本长度
    if (text.length > 200) {
      return new Response(JSON.stringify({ error: 'Text too long (max 200 chars)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 调用 Google Translate TTS
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob&total=1&idx=0&textlen=${text.length}`;

    try {
      const response = await fetch(ttsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://translate.google.com/',
        },
      });

      if (!response.ok) {
        return new Response(JSON.stringify({ error: 'TTS service error', status: response.status }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const audioBuffer = await response.arrayBuffer();

      return new Response(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
