// Cloudflare Pages Function — API proxy to Worker
// Proxies /api/* → https://lucky-bunny-api.luckybunny-arg.workers.dev/*

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // Reconstruct the target URL
  const targetPath = url.pathname.replace(/^\/api/, '') + url.search;
  const targetUrl = 'https://lucky-bunny-api.luckybunny-arg.workers.dev' + targetPath;

  // Fetch from the Worker with the same method, headers, and body
  const modified = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined
  });

  const response = await fetch(modified);
  
  // Add CORS headers
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type');

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  });
}
