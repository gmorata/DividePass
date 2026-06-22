-- ============================================================
-- Destaque e fixar no topo para plataformas
-- ============================================================

ALTER TABLE streaming_services
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
