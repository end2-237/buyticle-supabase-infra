const http = require("http");
const STORAGE_PORT = 5002;
const CORS_HEADERS = [
  "authorization", "x-client-info", "apikey", "content-type", "x-upsert",
  "x-source", "range", "cache-control",
  "upload-length", "upload-metadata", "tus-resumable", "upload-offset",
].join(", ");

function handle(req, res) {
  const origin = req.headers["origin"];
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", CORS_HEADERS);
    res.setHeader("Access-Control-Max-Age", "86400");
    res.writeHead(204);
    res.end();
    return;
  }
  let path = req.url;
  if (path.startsWith("/storage/v1")) path = path.replace("/storage/v1", "") || "/";
  const p = http.request(
    { hostname: "127.0.0.1", port: STORAGE_PORT, path, method: req.method, headers: req.headers },
    (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); }
  );
  p.on("error", () => { res.writeHead(502); res.end("Bad Gateway"); });
  req.pipe(p);
}

// Port 5000 : trafic externe (Traefik/Coolify route storage.vps.buyticle.com ici)
http.createServer(handle).listen(5000, () => console.log("proxy 5000 → 5002"));
// Port 5001 : fallback / ancien chemin interne
http.createServer(handle).listen(5001, () => console.log("proxy 5001 → 5002"));
// Port 5003 : Studio interne (supabase-js pointe parfois ici)
http.createServer(handle).listen(5003, () => console.log("proxy 5003 → 5002"));
