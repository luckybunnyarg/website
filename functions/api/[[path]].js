// Cloudflare Pages Function — API proxy to Worker
// Proxies /api/* → https://luckybunny-api.luckybunny-arg.workers.dev/*

export async function onRequest(context) {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };

  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(context.request.url);
    const targetPath = url.pathname.replace(/^\/api\/?/, '/') + url.search;
    const targetUrl = 'https://lucky-bunny-api.luckybunny-arg.workers.dev' + targetPath;

    // Clone the request to preserve the body stream
    const req = context.request.clone();
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null
    });

    // Add CORS to response
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      headers.set(k, v);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}
