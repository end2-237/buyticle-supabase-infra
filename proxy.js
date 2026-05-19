const http = require('http');

const PORT = 5000;
const GATEWAY_PORT = 5003;
const STORAGE_PORT = 5002;

function forward(req, res, hostname, port, path) {
  const proxy = http.request(
    { hostname, port, path, method: req.method, headers: req.headers },
    (proxyRes) => { res.writeHead(proxyRes.statusCode, proxyRes.headers); proxyRes.pipe(res); }
  );
  proxy.on('error', () => { res.writeHead(502); res.end('Bad Gateway'); });
  req.pipe(proxy);
}

// External storage proxy on port 5000 (Coolify routes storage.vps.buyticle.com here)
http.createServer((req, res) => {
  let path = req.url;
  if (path.startsWith('/storage/v1')) {
    path = path.replace('/storage/v1', '') || '/';
  }
  forward(req, res, 'localhost', STORAGE_PORT, path);
}).listen(PORT, () => console.log(`Storage proxy on port ${PORT}`));

// Internal API gateway on port 5003 (for Studio supabase-js client)
http.createServer((req, res) => {
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
