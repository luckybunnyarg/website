/**
 * Google Apps Script — Lucky Bunny Store + Admin Database
 * 
 * SETUP:
 * 1. Google Sheet with 3 sheets: "Products", "Orders", "Settings"
 * 2. Extensions → Apps Script → paste this file
 * 3. Deploy → New Deployment → Web App → Execute as: Me → Access: Anyone
 * 4. Copy Web App URL into store.html → GAS_URL and admin.html → GAS_URL
 * 
 * PRODUCTS sheet columns (row 1):
 *   id | name | category | price | referencePrice | image | coverImage | hoverImage | extraImages | badge | sizes | description | stock | salesCount | discount | active
 * 
 * ORDERS sheet columns (row 1):
 *   timestamp | name | email | address | notes | items | total | status
 * 
 * SETTINGS sheet columns (row 1):
 *   key | value
 *   Default rows: storeDiscount=0, bannerText='', bannerActive=FALSE, bannerLink=''
 */

// ── GET: Return active products ──
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : null;
    
    if (action === 'all-products') {
      return getAllProducts();
    }
    if (action === 'settings') {
      return getSettings();
    }
    if (action === 'orders') {
      return getOrders();
    }
    
    // Default: return active products (for store frontend)
    return getActiveProducts();
  } catch (err) {
    return jsonResponse({ error: err.toString() }, 500);
  }
}

// ── POST: Save product, settings, or order ──
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'save-product') {
      return saveProduct(data.product);
    }
    if (action === 'delete-product') {
      return deleteProduct(data.id);
    }
    if (action === 'save-settings') {
      return saveSettings(data.settings);
    }
    if (action === 'save-order') {
      return saveOrder(data);
    }
    
    // Legacy: treat as order
    return saveOrder(data);
  } catch (err) {
    return jsonResponse({ error: err.toString() }, 500);
  }
}

// ── Products ──
function getActiveProducts() {
  const sheet = getProductSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse([]);
  
  const headers = data[0].map(h => String(h).trim());
  const products = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = parseProductRow(headers, row);
    if (obj.active) products.push(obj);
  }
  
  return jsonResponse(products);
}

function getAllProducts() {
  const sheet = getProductSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse([]);
  
  const headers = data[0].map(h => String(h).trim());
  const products = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = parseProductRow(headers, row);
    // Return ALL including inactive
    products.push(obj);
  }
  
  return jsonResponse(products);
}

function saveProduct(product) {
  const sheet = getProductSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  
  // Find row by id
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(product.id || '').trim()) {
      targetRow = i + 1; // 1-indexed
      break;
    }
  }
  
  const rowValues = productToRow(headers, product);
  
  if (targetRow > 0) {
    // Update existing
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
  } else {
    // Insert new
    sheet.appendRow(rowValues);
  }
  
  return jsonResponse({ status: 'ok', product: product });
}

function deleteProduct(id) {
  const sheet = getProductSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ status: 'ok', deleted: id });
    }
  }
  
  return jsonResponse({ status: 'error', message: 'Product not found' }, 404);
}

function parseProductRow(headers, row) {
  const obj = {};
  headers.forEach((h, idx) => {
    if (idx < row.length) {
      let val = row[idx];
      if (['price', 'referencePrice', 'stock', 'salesCount', 'discount'].includes(h)) {
        val = Number(val) || 0;
      }
      if (['sizes', 'extraImages'].includes(h) && typeof val === 'string') {
        val = val.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (h === 'active' && typeof val === 'string') {
        val = val.toUpperCase() === 'TRUE';
      }
      obj[h] = val;
    }
  });
  return obj;
}

function productToRow(headers, product) {
  return headers.map(h => {
    let val = product[h];
    if (val === undefined || val === null) val = '';
    if (h === 'sizes' && Array.isArray(val)) val = val.join(', ');
    if (h === 'extraImages' && Array.isArray(val)) val = val.join(', ');
    if (h === 'active') val = val === true || val === 'TRUE' ? 'TRUE' : 'FALSE';
    return val;
  });
}

function getProductSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
  if (!sheet) throw new Error('Products sheet not found');
  return sheet;
}

// ── Orders ──
function saveOrder(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders');
  if (!sheet) return jsonResponse({ error: 'Orders sheet not found' }, 404);
  
  sheet.appendRow([
    new Date().toISOString(),
    data.name || '',
    data.email || '',
    data.address || '',
    data.notes || '',
    JSON.stringify(data.items || []),
    data.total || 0,
    'pending'
  ]);
  
  return jsonResponse({ status: 'ok', message: 'Order created' });
}

function getOrders() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders');
  if (!sheet) return jsonResponse([]);
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse([]);
  
  const headers = data[0].map(h => String(h).trim());
  const orders = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = idx < row.length ? row[idx] : '';
    });
    orders.push(obj);
  }
  
  return jsonResponse(orders.reverse());
}

// ── Settings ──
function saveSettings(settings) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
  if (!sheet) return jsonResponse({ error: 'Settings sheet not found' }, 404);
  
  // Clear existing settings
  const data = sheet.getDataRange().getValues();
  if (data.length > 1) sheet.getRange(2, 1, data.length - 1, 2).clearContent();
  
  // Write settings
  const rows = Object.entries(settings).map(([k, v]) => [k, String(v)]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
  
  return jsonResponse({ status: 'ok', settings: settings });
}

function getSettings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
  if (!sheet) return jsonResponse({});
  
  const data = sheet.getDataRange().getValues();
  const settings = {};
  
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    let val = data[i][1];
    if (val === 'TRUE') val = true;
    if (val === 'FALSE') val = false;
    if (!isNaN(val) && val !== '' && val !== true && val !== false) val = Number(val);
    if (key) settings[key] = val;
  }
  
  return jsonResponse(settings);
}

// ── Helpers ──
function jsonResponse(data, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
