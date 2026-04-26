const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = ROOT;
const REQUEST_CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_GAP_MS = 900;
const MAX_RETRIES = 3;
const requestCache = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const accounts = [
  { name: 'pollitoculon', tag: 'culon', platform: 'pc', region: 'eu', playlist: 'competitive', tracker: 'https://tracker.gg/valorant/profile/riot/pollitoculon%23culon/overview?platform=pc&playlist=competitive&season=9d85c932-4820-c060-09c3-668636d4df1b' },
  { name: 'rickyedit', tag: 'AND', platform: 'pc', region: 'eu', playlist: 'competitive', tracker: 'https://tracker.gg/valorant/profile/riot/rickyedit%23AND/overview?platform=pc&playlist=competitive' },
  { name: 'Peluche', tag: 'EDDCC', platform: 'pc', region: 'eu', playlist: 'competitive', tracker: 'https://tracker.gg/valorant/profile/riot/Peluche%23EDDCC/overview?platform=pc&playlist=competitive' },
  { name: 'OtakuCulon', tag: 'pollo', platform: 'pc', region: 'eu', playlist: 'competitive', tracker: 'https://tracker.gg/valorant/profile/riot/OtakuCulon%23pollo/overview?platform=pc&playlist=competitive' },
  { name: 'Kurumi Tokisaki', tag: 'pollo', platform: 'pc', region: 'eu', playlist: 'competitive', tracker: 'https://tracker.gg/valorant/profile/riot/Kurumi%20Tokisaki%23pollo/overview?platform=pc&playlist=competitive&season=9d85c932-4820-c060-09c3-668636d4df1b' },
  { name: 'Kael', tag: 'pollo', platform: 'pc', region: 'eu', playlist: 'competitive', tracker: 'https://tracker.gg/valorant/profile/riot/Kael%23pollo/overview?platform=pc&playlist=competitive' },
  { name: 'Wolfie', tag: 'BOSS', platform: 'pc', region: 'eu', playlist: 'competitive', tracker: 'https://tracker.gg/valorant/profile/riot/Wolfie%23BOSS/overview?platform=pc&playlist=competitive' },
  { name: 'yoshi', tag: 'pollo', platform: 'pc', region: 'eu', playlist: 'competitive', tracker: 'https://tracker.gg/valorant/profile/riot/yoshi%23pollo/overview?platform=pc&playlist=competitive' },
  { name: 'ChicaGamer', tag: 'nya', platform: 'pc', region: 'eu', playlist: 'competitive', tracker: 'https://tracker.gg/valorant/profile/riot/ChicaGamer%23nya/overview?platform=pc&playlist=competitive' },
  { name: 'Yumeko Jabami', tag: 'pollo', platform: 'pc', region: 'eu', playlist: 'competitive', tracker: 'https://tracker.gg/valorant/profile/riot/Yumeko%20Jabami%23pollo/overview?platform=pc&playlist=competitive' },
  { name: 'CarryPotter', tag: 'pollo', platform: 'pc', region: 'eu', playlist: 'swiftplay', tracker: 'https://tracker.gg/valorant/profile/riot/CarryPotter%23pollo/overview?platform=pc&playlist=swiftplay' },
];

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function normalizeAccountName(name, tag) {
  return `${name}#${tag}`.trim();
}

function accountKey(account) {
  return normalizeAccountName(account.name, account.tag).toLowerCase();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCachedAccount(account) {
  const cached = requestCache.get(accountKey(account));
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > REQUEST_CACHE_TTL_MS) {
    requestCache.delete(accountKey(account));
    return null;
  }
  return cached;
}

function setCachedAccount(account, payload) {
  requestCache.set(accountKey(account), {
    updatedAt: Date.now(),
    payload,
  });
}

async function fetchHenrikMmr(apiKey, region, platform, account) {
  const encodedName = encodeURIComponent(account.name);
  const encodedTag = encodeURIComponent(account.tag);
  const url = `https://api.henrikdev.xyz/valorant/v3/mmr/${encodeURIComponent(region)}/${encodeURIComponent(platform)}/${encodedName}/${encodedTag}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      const payload = {
        account,
        ok: true,
        status: response.status,
        data: data.data || data,
      };
      setCachedAccount(account, payload);
      return payload;
    }

    if (response.status === 429 && attempt < MAX_RETRIES - 1) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader
        ? Math.max(1000, Number(retryAfterHeader) * 1000)
        : REQUEST_GAP_MS * (attempt + 2);
      await sleep(retryAfterMs);
      continue;
    }

    return {
      account,
      ok: false,
      status: response.status,
      error: data?.message || data?.error || `HTTP ${response.status}`,
    };
  }

  return {
    account,
    ok: false,
    status: 429,
    error: 'Rate limit reached after retries',
  };
}

async function handleRankLookup(req, res) {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const apiKey = body.apiKey || req.headers['x-api-key'] || process.env.HENRIKDEV_API_KEY || '';
      const accountsPayload = Array.isArray(body.accounts) ? body.accounts : [];
      const region = body.region || 'eu';
      const platform = body.platform || 'pc';

      if (!accountsPayload.length) {
        sendJson(res, 400, { error: 'No accounts provided.' });
        return;
      }

      if (!apiKey) {
        sendJson(res, 400, {
          error: 'Missing HenrikDev API key. Add it in the app or set HENRIKDEV_API_KEY.',
        });
        return;
      }

      const results = [];
      for (const account of accountsPayload) {
        const cached = getCachedAccount(account);
        if (cached) {
          results.push(cached.payload);
          await sleep(REQUEST_GAP_MS);
          continue;
        }

        try {
          const result = await fetchHenrikMmr(apiKey, region, platform, account);
          results.push(result);
        } catch (error) {
          results.push({
            account,
            ok: false,
            status: 500,
            error: error?.message || 'Request failed',
          });
        }

        await sleep(REQUEST_GAP_MS);
      }

      sendJson(res, 200, { results });
    } catch (error) {
      sendJson(res, 500, { error: error?.message || 'Unexpected error' });
    }
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'GET' && pathname === '/api/accounts') {
    sendJson(res, 200, { accounts });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/rank') {
    handleRankLookup(req, res);
    return;
  }

  const filePath = pathname === '/' ? path.join(PUBLIC, 'index.html') : path.join(PUBLIC, pathname);
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      serveFile(res, filePath);
      return;
    }
    if (pathname !== '/' && pathname.includes('.')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    serveFile(res, path.join(PUBLIC, 'index.html'));
  });
});

server.listen(PORT, () => {
  console.log(`Valorant rank app running on http://localhost:${PORT}`);
});
