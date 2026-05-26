export async function onRequest(context) {
  // Test: just return 'ok' to verify the function runs
  try {
    const url = new URL(context.request.url);
    const workerPath = url.pathname.replace('/api', '') + url.search;
    const workerUrl = 'https://lucky-bunny-api.luckybunny-arg.workers.dev' + workerPath;
    
    const response = await fetch(workerUrl, context.request);
    return response;
  } catch(e) {
    return new Response(JSON.stringify({error:e.message}), {status:500,headers:{'Content-Type':'application/json'}});
  }
}
