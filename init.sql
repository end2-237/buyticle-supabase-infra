DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin WITH LOGIN PASSWORD 'buyticle' SUPERUSER BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT ALL ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA storage TO service_role, supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role, supabase_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO service_role, supabase_admin;
GRANT ALL ON DATABASE postgres TO supabase_admin;