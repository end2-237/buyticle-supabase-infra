# Solution — Supabase self-hosted sur Coolify (Buyticle)

## Problèmes résolus

### 1. `localhost:8000` hardcodé dans Studio
`supabase/studio:latest` compile Next.js avec `localhost:8000` (Kong gateway) baked dans les bundles JS **et** dans `/app/apps/studio/.env`. Les `ENV` Docker sont ignorés car le `.env` interne a la priorité dans Next.js.

**Fix** (`Dockerfile.studio`) :
- `RUN find /app -name "*.js" ...` → remplace dans tous les bundles compilés
- `RUN sed -i ... /app/apps/studio/.env` → remplace dans le fichier `.env` interne

### 2. CORS bloqué sur l'upload TUS (`x-source` refusé)
L'API storage (`supabase/storage-api:v1.11.13`) gère le TUS via un handler dédié qui **bypass le middleware CORS de Fastify**. La réponse OPTIONS ne contient aucun header CORS.

**Fix** (`proxy.js`) : proxy Node.js intercalé entre Traefik et l'API storage :
- Intercepte les OPTIONS → répond 204 avec les bons headers CORS (incluant `x-source`, `tus-resumable`, `upload-offset`, etc.)
- Strip le préfixe `/storage/v1/` avant de forwarder
- Écoute sur 3 ports : **5000** (Traefik externe), **5001** (fallback interne), **5003** (Studio supabase-js)

## Architecture finale

```
Browser
  │
  └─► Traefik (coolify-proxy :443)
        │  storage.vps.buyticle.com → storage container
        │
        └─► proxy.js :5000 ─────────► storage-api :5002
              :5001 ─────────►
              :5003 ─────────►       (strip /storage/v1/, CORS)

Studio Next.js (server-side)
  └─► STORAGE_URL=http://storage:5001 → proxy.js :5001 → storage-api :5002
```

## Fichiers modifiés

### `proxy.js`
- Ports : 5000, 5001, 5003 → forward vers 5002 (`127.0.0.1`)
- CORS : répond au preflight OPTIONS avec `Access-Control-Allow-Headers` complets
- Strip : `/storage/v1/` retiré avant forward

### `Dockerfile.storage`
- `ENV SERVER_PORT=5002` (l'API storage écoute sur 5002, libère 5000 pour le proxy)
- `COPY proxy.js /proxy.js`
- `ENTRYPOINT` : démarre proxy.js en background + storage API au premier plan

### `Dockerfile.studio`
- `RUN find ... sed` → patch les bundles JS compilés (localhost:8000 → storage.vps.buyticle.com)
- `RUN sed -i ... .env` → patch le `.env` interne (SUPABASE_URL, STORAGE_URL, PG_META_URL, clés JWT)
- `ENV` → valeurs de fallback si le `.env` ne contient pas la clé

## Fix manuel (sans rebuild Coolify)

Si le container storage tourne mais le proxy est cassé, appliquer directement :

```bash
# 1. Créer le proxy corrigé
cat > /tmp/proxy.js << 'EOF'
const http = require("http");
const STORAGE_PORT = 5002;
const CORS_HEADERS = "authorization, x-client-info, apikey, content-type, x-upsert, x-source, range, cache-control, upload-length, upload-metadata, tus-resumable, upload-offset";
function handle(req, res) {
  const origin = req.headers["origin"];
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", CORS_HEADERS);
    res.setHeader("Access-Control-Max-Age", "86400");
    res.writeHead(204); res.end(); return;
  }
  let path = req.url;
  if (path.startsWith("/storage/v1")) path = path.replace("/storage/v1", "") || "/";
  const p = http.request({hostname:"127.0.0.1",port:STORAGE_PORT,path,method:req.method,headers:req.headers},(pr)=>{res.writeHead(pr.statusCode,pr.headers);pr.pipe(res);});
  p.on("error",()=>{res.writeHead(502);res.end("Bad Gateway");});
  req.pipe(p);
}
http.createServer(handle).listen(5000,()=>console.log("proxy 5000 → 5002"));
http.createServer(handle).listen(5001,()=>console.log("proxy 5001 → 5002"));
http.createServer(handle).listen(5003,()=>console.log("proxy 5003 → 5002"));
EOF

# 2. Injecter dans le container
CONTAINER=cmolfws860017os9rv0ps1hvb-storage
docker cp /tmp/proxy.js $CONTAINER:/proxy.js
docker exec $CONTAINER sh -c "kill \$(netstat -tlnp 2>/dev/null | grep node | grep -v '5002' | awk '{print \$7}' | cut -d/ -f1 | head -1) 2>/dev/null; true"
docker exec -d $CONTAINER node /proxy.js

# 3. Patcher le Studio (localhost:8000)
STUDIO=cmolfws860017os9rv0ps1hvb-studio
docker exec $STUDIO sh -c "find /app -name '*.js' -type f | xargs grep -l 'localhost:8000' 2>/dev/null | xargs -r sed -i -e 's|http://localhost:8000|https://storage.vps.buyticle.com|g'"
docker exec $STUDIO sh -c "sed -i -e 's|SUPABASE_URL=http://localhost:8000|SUPABASE_URL=https://storage.vps.buyticle.com|g' -e 's|STUDIO_PG_META_URL=.*|STUDIO_PG_META_URL=http://meta:8080|g' -e 's|STORAGE_URL=.*|STORAGE_URL=http://storage:5001|g' /app/apps/studio/.env 2>/dev/null"
docker restart $STUDIO
```

## Vérification

```bash
# Tester le preflight CORS
curl -si -X OPTIONS https://storage.vps.buyticle.com/storage/v1/upload/resumable \
  -H "Origin: https://supabase.vps.buyticle.com" \
  -H "Access-Control-Request-Headers: x-source, content-type, authorization" \
  | head -10
# Doit retourner HTTP/2 204 avec access-control-allow-origin

# Vérifier les ports du container storage
docker exec <container-storage> sh -c "netstat -tlnp 2>/dev/null"
# Doit montrer 5000, 5001, 5002, 5003

# Vérifier le .env du Studio
docker exec <container-studio> grep -E "SUPABASE_URL|STORAGE_URL|PG_META" /app/apps/studio/.env
```
