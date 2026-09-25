import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(express.json());

// Path to data files
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const ordersFile = path.join(dataDir, 'orders.json');
if (!fs.existsSync(ordersFile)) {
  fs.writeFileSync(ordersFile, JSON.stringify([]));
}
const configFile = path.join(dataDir, 'config.json');
if (!fs.existsSync(configFile)) {
  fs.writeFileSync(configFile, JSON.stringify({}));
}

// Serve static assets
app.use(express.static(__dirname));

// API: Get Google Sheets config
app.get('/api/sheets-config', (req, res) => {
  try {
    const raw = fs.readFileSync(configFile, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.json({});
  }
});

// API: Save Google Sheets config
app.post('/api/sheets-config', (req, res) => {
  try {
    const { spreadsheetId, spreadsheetUrl } = req.body;
    const config = { spreadsheetId, spreadsheetUrl, updatedAt: new Date().toISOString() };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    res.json({ success: true, config });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Get all orders
app.get('/api/orders', (req, res) => {
  try {
    const raw = fs.readFileSync(ordersFile, 'utf8');
    const orders = JSON.parse(raw);
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read orders' });
  }
});

// API: Create new order
app.post('/api/orders', (req, res) => {
  try {
    const { customerName, phone, address, note, paymentMethod, items, total, sheetSynced } = req.body;
    if (!customerName || !phone || !address || !items || !items.length) {
      return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin đặt hàng' });
    }

    const orderId = 'HF-' + Date.now().toString().slice(-6);
    const orderDate = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    const newOrder = {
      orderId,
      createdAt: orderDate,
      customerName,
      phone,
      address,
      note: note || '',
      paymentMethod: paymentMethod || 'COD (Thanh toán khi nhận hàng)',
      items,
      total,
      sheetSynced: !!sheetSynced,
      status: 'Mới tiếp nhận'
    };

    const raw = fs.readFileSync(ordersFile, 'utf8');
    const orders = JSON.parse(raw);
    orders.unshift(newOrder);
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));

    console.log(`[Order] Đơn hàng mới: ${orderId} - ${customerName} (${phone}) - ${total}đ`);
    res.json({ success: true, order: newOrder });
  } catch (e) {
    console.error('Error saving order:', e);
    res.status(500).json({ error: e.message });
  }
});

// Routes for pages
app.get(['/gioi-thieu', '/about', '/gioi-thieu.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'gioi-thieu.html'));
});

app.get(['/lien-he', '/contact', '/lien-he.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'lien-he.html'));
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
