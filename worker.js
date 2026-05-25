// Lucky Bunny API v2 — Cloudflare Worker
// R2 bucket: lucky-bunny-store
//
// SETUP:
//   1. R2 binding: variable name STORE → bucket lucky-bunny-store
//   2. Env variable: R2_PUBLIC = pub-12d1d3df1d9c4a5faff6370acc9d8fcd.r2.dev
//   3. R2 bucket Public Access = Enabled

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    try {
      let response;
      if (request.method === 'GET') {
        response = await handleGet(url, action, env);
      } else if (request.method === 'POST') {
        response = await handlePost(request, env);
      } else {
        response = json({ error: 'Method not allowed' }, 405);
      }
      return addCors(response);
    } catch (err) {
      return addCors(json({ error: err.message || 'Server error' }, 500));
    }
  }
};

// ═══════════ GET ═══════════
async function handleGet(url, action, env) {
  // Health check
  if (!action || action === 'health') {
    return json({ status: 'ok', r2: !!env.STORE, storage: 'R2' });
  }

  // Save via GET (admin sync)
  if (action === 'save-product') {
    const raw = url.searchParams.get('data');
    if (!raw) return json({ error: 'Missing data param' }, 400);
    return await saveProduct(env, JSON.parse(raw));
  }

  if (action === 'save-settings') {
    const raw = url.searchParams.get('data');
    if (!raw) return json({ error: 'Missing data param' }, 400);
    return await saveSettings(env, JSON.parse(raw));
  }

  // Read
  if (action === 'all-products') return await getAllProducts(env);
  if (action === 'settings')     return await getSettings(env);
  if (action === 'orders')       return await getOrders(env);

  // Default: active products for store
  return await getActiveProducts(env);
}

// ═══════════ POST ═══════════
async function handlePost(request, env) {
  // FormData upload (from admin form+iframe) — bypasses CORS
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    const action = formData.get('action') || 'upload';
    if (action === 'upload' && file && file.name) {
      const uploadId = formData.get('_uploadId') || '';
      return await uploadFile(env, file, uploadId);
    }
    return json({ error: 'Missing file or action' }, 400);
  }

  // JSON body
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const act = body.action;
  if (!act) return json({ error: 'Missing action' }, 400);

  if (act === 'upload-image')    return await uploadImage(env, body.image, body.filename);
  if (act === 'save-product')    return await saveProduct(env, body.product);
  if (act === 'delete-product')  return await deleteProduct(env, body.id);
  if (act === 'save-settings')   return await saveSettings(env, body.settings);
  if (act === 'save-order')      return await saveOrder(env, body);

  return await saveOrder(env, body);
}

// ═══════════ UPLOAD IMAGE ═══════════
async function uploadImage(env, base64Data, filename) {
  if (!base64Data) return json({ error: 'Missing image data' }, 400);
  if (!env.STORE) return json({ error: 'R2 binding not configured' }, 500);

  // Parse data URI: data:image/jpeg;base64,xxxx
  const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return json({ error: 'Invalid format. Expected data:[mime];base64,[data]' }, 400);

  const mime = match[1];
  const b64  = match[2];
  const ext  = mime.split('/')[1] || 'jpg';
  const name = (filename || 'img') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;

  // Decode
  let binary;
  try { binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
  catch { return json({ error: 'Invalid base64 data' }, 400); }

  // Upload
  await env.STORE.put(name, binary, { httpMetadata: { contentType: mime } });

  // Public URL
  const domain = env.R2_PUBLIC || '';
  if (!domain) return json({ error: 'R2_PUBLIC env var not set. Configure it in Worker Settings → Variables.' }, 500);

  const publicUrl = 'https://' + domain + '/' + name;
  return json({ status: 'ok', url: publicUrl, filename: name });
}

// ═══════════ UPLOAD FILE (FormData via form+iframe — bypasses CORS) ═══════════
async function uploadFile(env, file, uploadId) {
  if (!env.STORE) return uploadHTML({ error: 'R2 binding not configured', _uploadId: uploadId });

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const name = 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
  const mime = file.type || 'image/' + ext;

  const buffer = await file.arrayBuffer();
  await env.STORE.put(name, new Uint8Array(buffer), { httpMetadata: { contentType: mime } });

  const domain = env.R2_PUBLIC || '';
  if (!domain) return uploadHTML({ error: 'R2_PUBLIC env var not set', _uploadId: uploadId });

  return uploadHTML({ status: 'ok', url: 'https://' + domain + '/' + name, filename: name, _uploadId: uploadId });
}

function uploadHTML(data) {
  return new Response(
    '<!DOCTYPE html><html><body><script>window.parent.postMessage(' + JSON.stringify(data) + ',"*");</script></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ═══════════ PRODUCTS ═══════════
async function readJSON(env, filename) {
  if (!env.STORE) return null;
  const obj = await env.STORE.get(filename);
  if (!obj) return null;
  try { return JSON.parse(await obj.text()); } catch { return null; }
}

async function writeJSON(env, filename, data) {
  await env.STORE.put(filename, JSON.stringify(data));
}

async function getProducts(env) {
  const data = await readJSON(env, 'products.json');
  return Array.isArray(data) ? data : [];
}

async function getActiveProducts(env) {
  const all = await getProducts(env);
  return json(all.filter(p => p.active !== false));
}

async function getAllProducts(env) {
  return json(await getProducts(env));
}

async function saveProduct(env, product) {
  if (!product || !product.id || !product.name) {
    return json({ error: 'Product requires id and name' }, 400);
  }
  const products = await getProducts(env);
  const idx = products.findIndex(p => p.id === product.id);
  if (idx >= 0) products[idx] = { ...products[idx], ...product };
  else products.push(product);
  await writeJSON(env, 'products.json', products);
  return json({ status: 'ok', product });
}

async function deleteProduct(env, id) {
  let products = await getProducts(env);
  products = products.filter(p => p.id !== id);
  await writeJSON(env, 'products.json', products);
  return json({ status: 'ok', deleted: id });
}

// ═══════════ SETTINGS ═══════════
const DEFAULT_SETTINGS = { storeDiscount: 0, bannerActive: false, bannerText: '', bannerLink: '' };

async function getSettings(env) {
  const data = await readJSON(env, 'settings.json');
  return json(data && typeof data === 'object' ? data : DEFAULT_SETTINGS);
}

async function saveSettings(env, settings) {
  await writeJSON(env, 'settings.json', settings);
  return json({ status: 'ok', settings });
}

// ═══════════ ORDERS ═══════════
async function getOrders(env) {
  const data = await readJSON(env, 'orders.json');
  return json(Array.isArray(data) ? data : []);
}

async function saveOrder(env, order) {
  const orders = (await readJSON(env, 'orders.json')) || [];
  orders.unshift({ ...order, timestamp: new Date().toISOString(), status: 'pending' });
  await writeJSON(env, 'orders.json', orders);
  return json({ status: 'ok', message: 'Order created' });
}

// ═══════════ HELPERS ═══════════
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function addCors(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
