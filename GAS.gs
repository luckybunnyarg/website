/**
 * Google Apps Script — Lucky Bunny Store Database
 * 
 * SETUP:
 * 1. Create a Google Sheet with two sheets: "Products" and "Orders"
 * 2. Go to Extensions → Apps Script, paste this file
 * 3. Deploy → New Deployment → Web App
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 4. Copy the Web App URL into store.html → GAS_URL constant
 * 
 * PRODUCTS sheet columns (row 1 = headers):
 *   id | name | category | price | referencePrice | image | badge | sizes | description | stock | salesCount | active
 * 
 * ORDERS sheet columns (row 1 = headers):
 *   timestamp | name | email | address | notes | items | total | status
 */

function doGet() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Products');
    if (!sheet) {
      return jsonResponse({ error: 'Products sheet not found' }, 404);
    }
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return jsonResponse([]);
    }
    const headers = data[0].map(h => h.toString().trim());
    const products = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const obj = {};
      headers.forEach((h, idx) => {
        if (idx < row.length) {
          let val = row[idx];
          // Parse numeric fields
          if (['price', 'referencePrice', 'stock', 'salesCount'].includes(h)) {
            val = Number(val) || 0;
          }
          // Parse sizes (comma-separated string -> array)
          if (h === 'sizes' && typeof val === 'string') {
            val = val.split(',').map(s => s.trim()).filter(Boolean);
          }
          obj[h] = val;
        }
      });
      // Only include active products
      if (obj.active === true || obj.active === 'TRUE' || obj.active === true) {
        products.push(obj);
      }
    }
    return jsonResponse(products);
  } catch (e) {
    return jsonResponse({ error: e.toString() }, 500);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders');
    if (!sheet) {
      return jsonResponse({ error: 'Orders sheet not found' }, 404);
    }
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
  } catch (e) {
    return jsonResponse({ error: e.toString() }, 500);
  }
}

function jsonResponse(data, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  if (statusCode) {
    // Apps Script doesn't support custom status codes natively,
    // but we include the code in the response
    data._status = statusCode;
  }
  return output;
}
