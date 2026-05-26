const http = require('http');

const STUDIO_PORT = 3001;
const PROXY_PORT  = 3000;
const FROM = 'http://localhost:8000';
const TO   = 'https://storage.vps.buyticle.com';

// Injected into every HTML page before </head>
const INJECT = `<script>(function(){
  var f="${FROM}",t="${TO}";
  var xo=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    if(typeof u==="string"&&u.startsWith(f))arguments[1]=t+u.slice(f.length);
    return xo.apply(this,arguments);
  };
  var ff=window.fetch;
  if(ff)window.fetch=function(i,n){
    if(typeof i==="string"&&i.startsWith(f))i=t+i.slice(f.length);
    else if(i&&i.url&&i.url.startsWith(f))i=new Request(t+i.url.slice(f.length),i);
    return ff.call(window,i,n);
  };
})()</script>`;

http.createServer((req, res) => {
  const opts = {
    hostname: '127.0.0.1',
    port: STUDIO_PORT,
    path: req.url,
    method: req.method,
    headers: Object.assign({}, req.headers, { 'accept-encoding': 'identity' })eaders: Object.assign({}, req.headers, { 'accept-encoding': 'identity' })
  };

  const pr = http.request(opts, (ps) => {
    const ct = ps.headers['content-type'] || '';

    if (ct.includes('text/html')) {
      const headers = Object.assign({}, ps.headers);
      delete headers['content-length'];
      delete headers['content-encoding'];
      delete headers['transfer-encoding'];
      res.writeHead(ps.statusCode, headers);

      const chunks = [];
      ps.on('data', c => chunks.push(c));
      ps.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        res.end(body.replace('</head>', INJECT + '</head>'));
      });
    } else {
      res.writeHead(ps.statusCode, ps.headers);
      ps.pipe(res);
    }
  });

  pr.on('error', () => { res.writeHead(502); res.end('Bad Gateway'); });
  req.pipe(pr);
}).listen(PROXY_PORT, () => console.log('Studio inject-proxy on', PROXY_PORT));
