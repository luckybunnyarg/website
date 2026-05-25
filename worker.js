// Cloudflare Worker — Lucky Bunny API
// R2 bucket: lucky-bunny-store
// 
// Deploy:
//   1. Add R2 binding: variable STORE → lucky-bunny-store
//   2. Add env variable: R2_PUBLIC = your R2 public domain (e.g. pub-xxx.r2.dev)
//   3. Enable R2 Public Access on the bucket

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      const res = await handleRequest(request, env, action);
      // Add CORS to all responses
      const headers = new Headers(res.headers);
      Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      return json({ error: e.message }, 500, cors);
    }
  }
};

async function handleRequest(request, env, action) {
  // ── GET handlers ──
  if (request.method === 'GET') {
    if (action === 'save-product') {
      const data = request.url.includes('data=') ? new URL(request.url).searchParams.get('data') : null;
      if (!data) return json({ error: 'Missing data' }, 400);
      return await saveProduct(env, JSON.parse(data));
    }
    if (action === 'save-settings') {
      const data = new URL(request.url).searchParams.get('data');
      if (!data) return json({ error: 'Missing data' }, 400);
      return await saveSettings(env, JSON.parse(data));
    }
    if (action === 'all-products') return await getAllProducts(env);
    if (action === 'settings') return await getSettings(env);
    if (action === 'orders') return await getOrders(env);
    return await getActiveProducts(env);
  }

  // ── POST handlers ──
  if (request.method === 'POST') {
    const body = await request.json();
    const act = body.action || 'save-order';

    if (act === 'upload-image') {
      return await uploadImage(env, body.image, body.filename);
    }
    if (act === 'save-product') {
      return await saveProduct(env, body.product);
    }
    if (act === 'delete-product') {
      return await deleteProduct(env, body.id);
    }
    if (act === 'save-settings') {
      return await saveSettings(env, body.settings);
    }
    if (act === 'save-order') {
      return await saveOrder(env, body);
    }
    return await saveOrder(env, body);
  }

  return json({ error: 'Unknown method' }, 405);
}

// ═══════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════
async function getProducts(env) {
  const obj = await env.STORE.get('products.json');
  if (!obj) return [];
  const text = await obj.text();
  return text ? JSON.parse(text) : [];
}

async function saveProducts(env, products) {
  await env.STORE.put('products.json', JSON.stringify(products));
}

async function getActiveProducts(env) {
  const all = await getProducts(env);
  return json(all.filter(p => p.active !== false));
}

async function getAllProducts(env) {
  return json(await getProducts(env));
}

async function saveProduct(env, product) {
  const products = await getProducts(env);
  const idx = products.findIndex(p => p.id === product.id);
  if (idx >= 0) products[idx] = product;
  else products.push(product);
  await saveProducts(env, products);
  return json({ status: 'ok', product });
}

async function deleteProduct(env, id) {
  let products = await getProducts(env);
  products = products.filter(p => p.id !== id);
  await saveProducts(env, products);
  return json({ status: 'ok', deleted: id });
}

// ═══════════════════════════════════════════════
// UPLOAD IMAGE
// ═══════════════════════════════════════════════
async function uploadImage(env, base64Data, filename) {
  if (!base64Data) return json({ error: 'Missing image data' }, 400);

  // Extract base64 content (strip data:image/...;base64, prefix)
  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return json({ error: 'Invalid base64 format' }, 400);

  const mimeType = matches[1];       // e.g. image/jpeg, image/png, image/webp
  const base64 = matches[2];
  const ext = mimeType.split('/')[1] || 'jpg';
  const name = (filename || ('img-' + Date.now() + '-' + Math.random().toString(36).slice(2,8))) + '.' + ext;

  // Decode base64 to binary
  const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  // Upload to R2
  await env.STORE.put(name, binary, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { uploaded: new Date().toISOString() }
  });

  // Return public URL
  const publicDomain = env.R2_PUBLIC || 'pub-placeholder.r2.dev';
  const publicUrl = `https://${publicDomain}/${name}`;

  return json({ url: publicUrl, filename: name });
}

// ═══════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════
async function getSettings(env) {
  const obj = await env.STORE.get('settings.json');
  if (!obj) return json({ storeDiscount: 0, bannerActive: false, bannerText: '', bannerLink: '' });
  const text = await obj.text();
  return json(text ? JSON.parse(text) : { storeDiscount: 0, bannerActive: false, bannerText: '', bannerLink: '' });
}

async function saveSettings(env, settings) {
  await env.STORE.put('settings.json', JSON.stringify(settings));
  return json({ status: 'ok', settings });
}

// ═══════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════
async function getOrders(env) {
  const obj = await env.STORE.get('orders.json');
  if (!obj) return json([]);
  const text = await obj.text();
  return json(text ? JSON.parse(text) : []);
}

async function saveOrder(env, order) {
  const raw = await getOrdersRaw(env);
  raw.unshift({ ...order, timestamp: new Date().toISOString(), status: 'pending' });
  await env.STORE.put('orders.json', JSON.stringify(raw));
  return json({ status: 'ok', message: 'Order created' });
}

async function getOrdersRaw(env) {
  const obj = await env.STORE.get('orders.json');
  if (!obj) return [];
  const text = await obj.text();
  return text ? JSON.parse(text) : [];
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}
