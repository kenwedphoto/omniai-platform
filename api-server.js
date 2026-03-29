/**
 * OmniAI 後端 API 伺服器
 * 提供訂單、會員、消費紀錄等真實資料存取接口
 *
 * 啟動：node api-server.js
 * 預設 Port：3001
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.API_PORT || 3001;
const DB_PATH = path.join(__dirname, 'data');

// ── 確保資料目錄存在 ───────────────────────────────────
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });

// ── 簡易 JSON 資料庫 ────────────────────────────────────
function readDB(name) {
  const file = path.join(DB_PATH, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeDB(name, data) {
  fs.writeFileSync(path.join(DB_PATH, `${name}.json`), JSON.stringify(data, null, 2));
}

// ── 初始化示範資料（首次啟動） ──────────────────────────
function initSeedData() {
  if (readDB('members').length === 0) {
    writeDB('members', [
      { id: 'HB-2026-00001', name: 'Lena Chang', phone: '0922-111-222', email: 'lena@mail.com', status: '活躍', tags: ['已成交', 'VIP'], joined: '2024-04-01' },
      { id: 'HB-2026-00002', name: '陳建宏', phone: '0933-222-444', email: 'kevin@mail.com', status: '活躍', tags: ['已成交'], joined: '2024-04-01' },
      { id: 'HB-2026-00003', name: '王惠儀', phone: '0933-222-333', email: 'amy@line.com', status: '活躍', tags: ['已成交'], joined: '2025-09-01' },
    ]);
  }
  if (readDB('orders').length === 0) {
    writeDB('orders', [
      { id: 'ORD-2025-0112', memberId: 'HB-2026-00001', title: '婚紗拍攝套組', amount: 18000, paid: 18000, status: '已完成', date: '2025-11-15', note: '', brand: '赫本的秘密花園' },
      { id: 'ORD-2026-0108', memberId: 'HB-2026-00001', title: '全家福套組', amount: 10000, paid: 5000, status: '部分付款', date: '2026-01-08', note: '尾款待收', brand: '赫本的秘密花園' },
      { id: 'ORD-2025-1127', memberId: 'HB-2026-00003', title: '婚紗拍攝套組', amount: 20000, paid: 20000, status: '已完成', date: '2025-11-27', note: '', brand: '赫本的秘密花園' },
    ]);
  }
}

initSeedData();

// ── CORS headers ────────────────────────────────────────
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

// ── 回應工具 ────────────────────────────────────────────
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// ── API 路由 ────────────────────────────────────────────
const routes = {

  // ── 健康檢查 ──────────────────────────────────────────
  'GET /api/health': (req, res) => {
    json(res, { status: 'ok', version: '1.0.0', time: new Date().toISOString() });
  },

  // ── 訂單 API ──────────────────────────────────────────
  'GET /api/orders': (req, res) => {
    const orders = readDB('orders');
    const url = new URL(req.url, `http://localhost`);
    const memberId = url.searchParams.get('memberId');
    json(res, memberId ? orders.filter(o => o.memberId === memberId) : orders);
  },

  'POST /api/orders': async (req, res) => {
    const body = await readBody(req);
    if (!body.memberId || !body.title || body.amount === undefined) {
      return json(res, { error: '缺少必要欄位：memberId, title, amount' }, 400);
    }
    const orders = readDB('orders');
    const newOrder = {
      id: `ORD-${new Date().getFullYear()}-${String(orders.length + 1).padStart(4, '0')}`,
      memberId: body.memberId,
      title: body.title,
      amount: Number(body.amount),
      paid: Number(body.paid || 0),
      status: body.status || '待付款',
      date: body.date || new Date().toISOString().slice(0, 10),
      note: body.note || '',
      brand: body.brand || '',
      createdAt: new Date().toISOString(),
    };
    orders.push(newOrder);
    writeDB('orders', orders);
    json(res, newOrder, 201);
  },

  'PUT /api/orders/:id': async (req, res, params) => {
    const body = await readBody(req);
    const orders = readDB('orders');
    const idx = orders.findIndex(o => o.id === params.id);
    if (idx === -1) return json(res, { error: '訂單不存在' }, 404);
    orders[idx] = { ...orders[idx], ...body, id: params.id, updatedAt: new Date().toISOString() };
    writeDB('orders', orders);
    json(res, orders[idx]);
  },

  'DELETE /api/orders/:id': (req, res, params) => {
    const orders = readDB('orders');
    const filtered = orders.filter(o => o.id !== params.id);
    if (filtered.length === orders.length) return json(res, { error: '訂單不存在' }, 404);
    writeDB('orders', filtered);
    json(res, { success: true });
  },

  // ── 會員 API ──────────────────────────────────────────
  'GET /api/members': (req, res) => {
    const members = readDB('members');
    const url = new URL(req.url, `http://localhost`);
    const q = url.searchParams.get('q');
    json(res, q ? members.filter(m =>
      m.name.includes(q) || m.phone?.includes(q) || m.email?.includes(q) || m.id.includes(q)
    ) : members);
  },

  'GET /api/members/:id': (req, res, params) => {
    const members = readDB('members');
    const member = members.find(m => m.id === params.id);
    if (!member) return json(res, { error: '會員不存在' }, 404);
    const orders = readDB('orders').filter(o => o.memberId === params.id);
    json(res, { ...member, orders });
  },

  'POST /api/members': async (req, res) => {
    const body = await readBody(req);
    if (!body.name || (!body.phone && !body.email)) {
      return json(res, { error: '缺少必要欄位：name，phone 或 email 至少一項' }, 400);
    }
    const members = readDB('members');
    const newMember = {
      id: `HB-${new Date().getFullYear()}-${String(members.length + 1).padStart(5, '0')}`,
      ...body,
      status: '活躍',
      joined: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    members.push(newMember);
    writeDB('members', members);
    json(res, newMember, 201);
  },

  'PUT /api/members/:id': async (req, res, params) => {
    const body = await readBody(req);
    const members = readDB('members');
    const idx = members.findIndex(m => m.id === params.id);
    if (idx === -1) return json(res, { error: '會員不存在' }, 404);
    members[idx] = { ...members[idx], ...body, id: params.id, updatedAt: new Date().toISOString() };
    writeDB('members', members);
    json(res, members[idx]);
  },

  // ── 統計 API ──────────────────────────────────────────
  'GET /api/stats': (req, res) => {
    const orders = readDB('orders');
    const members = readDB('members');
    json(res, {
      totalMembers: members.length,
      totalOrders: orders.length,
      totalRevenue: orders.reduce((a, o) => a + o.amount, 0),
      totalPaid: orders.reduce((a, o) => a + o.paid, 0),
      totalUnpaid: orders.reduce((a, o) => a + (o.amount - o.paid), 0),
      ordersByStatus: orders.reduce((acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1; return acc;
      }, {}),
    });
  },
};

// ── 動態路由匹配（支援 :param） ─────────────────────────
function matchRoute(method, pathname) {
  for (const key of Object.keys(routes)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const keys = [];
    const regStr = pattern.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    const match = pathname.match(new RegExp(`^${regStr}$`));
    if (match) {
      const params = {};
      keys.forEach((k, i) => params[k] = match[i + 1]);
      return { handler: routes[key], params };
    }
  }
  return null;
}

// ── HTTP 伺服器 ─────────────────────────────────────────
const server = http.createServer((req, res) => {
  setCORSHeaders(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://localhost`);
  const route = matchRoute(req.method, url.pathname);

  if (route) {
    route.handler(req, res, route.params);
  } else {
    json(res, { error: `找不到路由：${req.method} ${url.pathname}` }, 404);
  }
});

server.listen(PORT, () => {
  console.log(`\n🌸 OmniAI API Server 啟動成功`);
  console.log(`   http://localhost:${PORT}/api/health`);
  console.log(`\n📋 可用 API 路由：`);
  console.log(`   GET    /api/health       健康檢查`);
  console.log(`   GET    /api/members      取得所有會員`);
  console.log(`   GET    /api/members/:id  取得單一會員（含訂單）`);
  console.log(`   POST   /api/members      新增會員`);
  console.log(`   PUT    /api/members/:id  更新會員`);
  console.log(`   GET    /api/orders       取得所有訂單`);
  console.log(`   GET    /api/orders?memberId=xxx  取得會員訂單`);
  console.log(`   POST   /api/orders       新增訂單`);
  console.log(`   PUT    /api/orders/:id   更新訂單`);
  console.log(`   DELETE /api/orders/:id   刪除訂單`);
  console.log(`   GET    /api/stats        統計資料\n`);
});
