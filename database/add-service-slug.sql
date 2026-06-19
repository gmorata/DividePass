-- ============================================================
-- MIGRATION: Adiciona slug para URLs amigáveis nos serviços
-- ============================================================

ALTER TABLE streaming_services
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Gera slugs para serviços existentes
UPDATE streaming_services SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;

-- Garante que novos registros tenham slug único
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION generate_service_slug(name TEXT) RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    suffix INT := 0;
BEGIN
    base_slug := lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'));
    final_slug := base_slug;
    WHILE EXISTS (SELECT 1 FROM streaming_services WHERE slug = final_slug) LOOP
        suffix := suffix + 1;
        final_slug := base_slug || '-' || suffix;
    END LOOP;
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;
