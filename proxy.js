const http = require('http');

const PORT = 5000;
const STORAGE_PORT = 5002;

http.createServer((req, res) => {
  let path = req.url;
  if (path.startsWith('/storage/v1')) {
    path = path.replace('/storage/v1', '') || '/';
  }
  
  const options = {
    hostname: 'localhost',
    port: STORAGE_PORT,
    path: path,
    method: req.method,
    headers: req.headers
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', (e) => {
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  req.pipe(proxy);
}).listen(PORT, () => {
  console.log(`Storage proxy listening on port ${PORT}`);
});