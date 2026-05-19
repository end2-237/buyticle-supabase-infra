const http = require('http');

const PORT = 5000;
const GATEWAY_PORT = 5003;
const STORAGE_PORT = 5002;

const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type, x-upsert, upload-length, upload-metadata, upload-offset, content-range, tus-resumable, upload-draft-interop-version, x-forwarded-host, x-source';
const ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS';
const EXPOSE_HEADERS = 'ETag, upload-offset, tus-resumable, content-range, upload-length';

function cors(req, res) {
  const origin = req.headers['origin'] || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
  res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
  res.setHeader('Access-Control-Expose-Headers', EXPOSE_HEADERS);
  res.setHeader('Access-Control-Max-Age', '3600');
  if (req.headers['origin']) res.setHeader('Vary', 'Origin');
}

function forward(req, res, hostname, port, path) {
  const proxy = http.request(
    { hostname, port, path, method: req.method, headers: req.headers },
    (proxyRes) => {
      const headers = Object.assign({}, proxyRes.headers);
      const origin = req.headers['origin'] || '*';
      headers['access-control-allow-origin'] = origin;
      headers['access-control-allow-methods'] = ALLOW_METHODS;
      headers['access-control-allow-headers'] = ALLOW_HEADERS;
      headers['access-control-expose-headers'] = EXPOSE_HEADERS;
      if (req.headers['origin']) headers['vary'] = 'Origin';
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    }
  );
  proxy.on('error', () => { res.writeHead(502); res.end('Bad Gateway'); });
  req.pipe(proxy);
}

// External storage proxy on port 5000 (Coolify routes storage.vps.buyticle.com here)
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    cors(req, res);
    res.writeHead(204);
    res.end();
    return;
  }
  let path = req.url;
  if (path.startsWith('/storage/v1')) {
    path = path.replace('/storage/v1', '') || '/';
  }
  forward(req, res, 'localhost', STORAGE_PORT, path);
}).listen(PORT, () => console.log(`Storage proxy on port ${PORT}`));

// Internal API gateway on port 5003 (for Studio supabase-js client)
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    cors(req, res);
    res.writeHead(204);
    res.end();
    return;
  }
  let path = req.url;
  let hostname = 'localhost', port = STORAGE_PORT;
  if (path.startsWith('/storage/v1')) {
    path = path.replace('/storage/v1', '') || '/';
  } else if (path.startsWith('/rest/v1')) {
    path = path.replace('/rest/v1', '') || '/';
    hostname = 'rest';
    port = 3000;
  }
  forward(req, res, hostname, port, path);
}).listen(GATEWAY_PORT, () => console.log(`API gateway on port ${GATEWAY_PORT}`));
