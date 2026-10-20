#!/usr/bin/env bash
# Prépare la base pour une NOUVELLE application (ou recrée l'accès d'une existante) :
#   - un schéma à son nom (créé s'il n'existe pas, et appartenant à l'application
#     pour qu'elle puisse créer ses propres tables / migrations)
#   - un compte PostgreSQL dédié, SANS droits super-utilisateur, limité à ce schéma
#   - affiche la DATABASE_URL à coller dans Coolify (rien n'est écrit sur le disque)
#
# Utilisation (sur le VPS) :  bash nouvelle-app.sh monapp
#   -> schéma "monapp", compte "app_monapp"
set -euo pipefail

NOM="${1:-}"
[[ "$NOM" =~ ^[a-z][a-z0-9_]{1,40}$ ]] || { echo "Usage : bash $0 nom_app   (minuscules, chiffres, _)"; exit 1; }
ROLE="app_$NOM"
HOTE="${HOTE:-supabase-db}"
DB=$(docker ps -q --filter name=db-clqsdxuj4zc4osangsdg1t36 | head -1)
[ -n "$DB" ] || { echo "Conteneur de la base Supabase introuvable."; exit 1; }
PW=$(openssl rand -hex 24)

docker exec -i "$DB" psql -U postgres -q -v ON_ERROR_STOP=1 -v role="$ROLE" -v schema="$NOM" -v pw="$PW" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'role')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role') \gexec
ALTER ROLE :"role" WITH LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB PASSWORD :'pw';
SELECT format('CREATE SCHEMA %I AUTHORIZATION %I', :'schema', :'role')
WHERE NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = :'schema') \gexec
ALTER ROLE :"role" SET search_path = :"schema", public;
GRANT USAGE, CREATE ON SCHEMA :"schema" TO :"role";
GRANT ALL ON ALL TABLES IN SCHEMA :"schema" TO :"role";
GRANT ALL ON ALL SEQUENCES IN SCHEMA :"schema" TO :"role";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA :"schema" TO :"role";
ALTER DEFAULT PRIVILEGES IN SCHEMA :"schema" GRANT ALL ON TABLES TO :"role";
ALTER DEFAULT PRIVILEGES IN SCHEMA :"schema" GRANT ALL ON SEQUENCES TO :"role";
GRANT USAGE ON SCHEMA public TO :"role";
-- Les outils de migration (Drizzle, Prisma…) lancent « CREATE SCHEMA IF NOT
-- EXISTS » à chaque démarrage : Postgres exige le droit CREATE sur la base,
-- même quand le schéma existe. Sans lui, l'application ne migre jamais.
SELECT format('GRANT CREATE ON DATABASE %I TO %I', current_database(), :'role') \gexec
-- Tables protégées par RLS : sans règle, le compte de l'application y voit 0 ligne
-- (sans erreur). On lui donne l'accès à SON schéma uniquement.
SELECT format('DROP POLICY IF EXISTS %I ON %I.%I; CREATE POLICY %I ON %I.%I FOR ALL TO %I USING (true) WITH CHECK (true)',
              :'role'||'_acces', n.nspname, c.relname, :'role'||'_acces', n.nspname, c.relname, :'role')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND c.relrowsecurity AND n.nspname = :'schema' \gexec
SQL

URL="postgres://$ROLE:$PW@$HOTE:5432/postgres"
echo "===== A coller dans Coolify (variable de l'application) + copie dans le Coffre 2FA ====="
echo "DATABASE_URL=$URL"
echo "======================================================================================"
docker run --rm --network coolify postgres:15-alpine psql "$URL" -Atc \
  "select 'Test de connexion OK (schéma '||current_schema()||')'" 2>&1 | tail -1
