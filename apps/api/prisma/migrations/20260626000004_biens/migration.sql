-- Migration : biens
-- Lot 1 · Module 2 · Étape 1 — Catalogue unique du parc immobilier.
--
-- Crée :
--   - 3 enums Postgres natifs (BienStatut, BienType, BienUsage)
--   - 3 tables : biens, bien_photos, bien_historique
--   - colonne geometry PostGIS sur biens.geo (SRID 4326)
--   - index GIST sur geo + indexes B-tree métier
--   - vue v_biens_par_commune
--   - politiques RLS avec FORCE (cohérent défense en profondeur Lot 0)
--
-- Règles non négociables respectées :
--   - tous les montants en BIGINT (centimes FCFA)
--   - reference unique par agence
--   - pas de FK Prisma vers contacts (intégrité côté service)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extension PostGIS (idempotent — déjà active depuis init scripts)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Enums Postgres natifs
--    Prisma génère ces types via `enum` dans schema.prisma.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "BienStatut" AS ENUM ('disponible', 'loue', 'saisonnier', 'hors_circuit');
CREATE TYPE "BienType"   AS ENUM ('villa', 'appartement', 'studio', 'bureau', 'local_commercial', 'terrain', 'immeuble', 'autre');
CREATE TYPE "BienUsage"  AS ENUM ('vente', 'location_longue_duree', 'saisonnier', 'mixte');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "biens" (
  "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"             UUID         NOT NULL,
  "entite_id"             UUID,

  "reference"             TEXT         NOT NULL,
  "nom"                   TEXT         NOT NULL,
  "description"           TEXT,

  "type"                  "BienType"   NOT NULL,
  "usage"                 "BienUsage"  NOT NULL DEFAULT 'location_longue_duree',
  "statut"                "BienStatut" NOT NULL DEFAULT 'disponible',

  "surface"               DECIMAL(8,2),
  "pieces"                INTEGER,
  "chambres"              INTEGER,
  "salles_bain"           INTEGER,
  "etage"                 INTEGER,
  "annee_construction"    INTEGER,
  "amenities"             TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],

  "adresse_ligne1"        TEXT         NOT NULL,
  "adresse_ligne2"        TEXT,
  "ville"                 TEXT         NOT NULL,
  "commune"               TEXT,
  "pays"                  TEXT         NOT NULL DEFAULT 'CI',
  "latitude"              DECIMAL(10,7),
  "longitude"             DECIMAL(10,7),

  "prix_vente_xof"        BIGINT,
  "loyer_mensuel_xof"     BIGINT,
  "charges_xof"           BIGINT,
  "caution_xof"           BIGINT,

  "yield_brut_pct"        DECIMAL(5,2),
  "yield_updated_at"      TIMESTAMPTZ,

  "proprietaire_id"       UUID,

  "statut_source"         TEXT         NOT NULL DEFAULT 'manuel',

  "score_ia"              INTEGER,
  "score_occupation"      TEXT,
  "score_rentabilite"     TEXT,
  "score_diversification" TEXT,
  "score_risque_impaye"   TEXT,
  "score_updated_at"      TIMESTAMPTZ,

  "agent_responsable_id"  UUID,
  "tags"                  TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "created_by"            UUID,
  "archived_at"           TIMESTAMPTZ,

  CONSTRAINT "biens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "biens_agence_id_reference_key" UNIQUE ("agence_id", "reference"),
  CONSTRAINT "biens_agence_id_fkey"
    FOREIGN KEY ("agence_id") REFERENCES "agences"("id") ON DELETE RESTRICT,
  CONSTRAINT "biens_pays_iso2_check"      CHECK (char_length(pays) = 2),
  CONSTRAINT "biens_statut_source_check"  CHECK (statut_source IN ('manuel', 'bail', 'reservation')),
  CONSTRAINT "biens_score_range_check"    CHECK (score_ia IS NULL OR (score_ia >= 0 AND score_ia <= 100)),
  CONSTRAINT "biens_latitude_range_check" CHECK (latitude  IS NULL OR (latitude  BETWEEN -90  AND 90)),
  CONSTRAINT "biens_longitude_range_check"CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  CONSTRAINT "biens_prix_vente_pos"       CHECK (prix_vente_xof    IS NULL OR prix_vente_xof    >= 0),
  CONSTRAINT "biens_loyer_pos"            CHECK (loyer_mensuel_xof IS NULL OR loyer_mensuel_xof >= 0),
  CONSTRAINT "biens_charges_pos"          CHECK (charges_xof       IS NULL OR charges_xof       >= 0),
  CONSTRAINT "biens_caution_pos"          CHECK (caution_xof       IS NULL OR caution_xof       >= 0)
);

CREATE TABLE "bien_photos" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"   UUID        NOT NULL,
  "bien_id"     UUID        NOT NULL,
  "storage_key" TEXT        NOT NULL,
  "caption"     TEXT,
  "ordre"       INTEGER     NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bien_photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bien_photos_bien_id_fkey"
    FOREIGN KEY ("bien_id") REFERENCES "biens"("id") ON DELETE CASCADE
);

CREATE TABLE "bien_historique" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "agence_id"    UUID        NOT NULL,
  "bien_id"      UUID        NOT NULL,
  "type"         TEXT        NOT NULL,
  "reference_id" UUID,
  "debut"        TIMESTAMPTZ,
  "fin"          TIMESTAMPTZ,
  "montant_xof"  BIGINT,
  "notes"        TEXT,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bien_historique_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bien_historique_bien_id_fkey"
    FOREIGN KEY ("bien_id") REFERENCES "biens"("id") ON DELETE CASCADE,
  CONSTRAINT "bien_historique_type_check"
    CHECK (type IN ('bail', 'reservation', 'vente', 'travaux', 'changement_proprietaire')),
  CONSTRAINT "bien_historique_montant_pos"
    CHECK (montant_xof IS NULL OR montant_xof >= 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Colonne PostGIS + index spatial
--    geometry(Point, 4326) = WGS84 (lat/lng standard).
--    Pas géré par Prisma — accédé via raw SQL dans le repository.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "biens" ADD COLUMN "geo" geometry(Point, 4326);

CREATE INDEX "biens_geo_gist_idx"   ON "biens" USING GIST ("geo");
CREATE INDEX "biens_agence_idx"     ON "biens" ("agence_id");
CREATE INDEX "biens_statut_idx"     ON "biens" ("agence_id", "statut");
CREATE INDEX "biens_ville_idx"      ON "biens" ("agence_id", "ville", "commune");
CREATE INDEX "biens_type_usage_idx" ON "biens" ("agence_id", "type", "usage");
CREATE INDEX "biens_proprio_idx"    ON "biens" ("agence_id", "proprietaire_id");
CREATE INDEX "biens_score_idx"      ON "biens" ("agence_id", "score_ia");
CREATE INDEX "biens_commune_partial_idx"
  ON "biens" ("agence_id", "commune") WHERE commune IS NOT NULL;
CREATE INDEX "biens_archived_idx"
  ON "biens" ("agence_id", "archived_at") WHERE archived_at IS NOT NULL;

CREATE INDEX "bien_photos_ordre_idx"     ON "bien_photos" ("agence_id", "bien_id", "ordre");
CREATE INDEX "bien_historique_type_idx"  ON "bien_historique" ("agence_id", "bien_id", "type");
CREATE INDEX "bien_historique_debut_idx" ON "bien_historique" ("agence_id", "bien_id", "debut");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON "biens"           TO civora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "bien_photos"     TO civora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "bien_historique" TO civora_app;
GRANT ALL PRIVILEGES ON "biens"           TO civora_admin;
GRANT ALL PRIVILEGES ON "bien_photos"     TO civora_admin;
GRANT ALL PRIVILEGES ON "bien_historique" TO civora_admin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Row-Level Security (ENABLE + FORCE — défense en profondeur Lot 0)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "biens"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "biens"           FORCE  ROW LEVEL SECURITY;
ALTER TABLE "bien_photos"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bien_photos"     FORCE  ROW LEVEL SECURITY;
ALTER TABLE "bien_historique" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bien_historique" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "biens_tenant" ON "biens"
  FOR ALL
  USING      (agence_id::text = current_setting('app.agence_id', TRUE))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', TRUE));

-- bien_photos : isolation directe sur agence_id (dénormalisé pour éviter une jointure
-- coûteuse à chaque lecture).
CREATE POLICY "bien_photos_tenant" ON "bien_photos"
  FOR ALL
  USING      (agence_id::text = current_setting('app.agence_id', TRUE))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', TRUE));

CREATE POLICY "bien_historique_tenant" ON "bien_historique"
  FOR ALL
  USING      (agence_id::text = current_setting('app.agence_id', TRUE))
  WITH CHECK (agence_id::text = current_setting('app.agence_id', TRUE));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Vue d'agrégation par commune
--    Définie avec security_invoker=true (Postgres 15+) pour qu'elle hérite
--    automatiquement de la RLS de la table sous-jacente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW "v_biens_par_commune"
  WITH (security_invoker = true)
AS
SELECT
  agence_id,
  commune,
  count(*)::int                                        AS total,
  count(*) FILTER (WHERE statut = 'loue')::int         AS loues,
  count(*) FILTER (WHERE statut = 'saisonnier')::int   AS saisonnier,
  count(*) FILTER (WHERE statut = 'disponible')::int   AS disponibles,
  count(*) FILTER (WHERE statut = 'hors_circuit')::int AS hors_circuit,
  avg(loyer_mensuel_xof)::bigint                       AS loyer_moyen_xof,
  avg(prix_vente_xof)::bigint                          AS prix_vente_moyen_xof
FROM "biens"
WHERE commune IS NOT NULL AND archived_at IS NULL
GROUP BY agence_id, commune;

GRANT SELECT ON "v_biens_par_commune" TO civora_app, civora_admin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Trigger : synchroniser geo ↔ latitude/longitude
--    Quand l'app pose lat/lng (champ Prisma), on remplit geo.
--    Quand on pose geo en raw SQL, on remplit lat/lng.
--    Garantit que les deux représentations restent cohérentes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION biens_sync_geo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.geo IS NULL AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geo := ST_SetSRID(ST_MakePoint(NEW.longitude::double precision, NEW.latitude::double precision), 4326);
  ELSIF NEW.geo IS NOT NULL AND (NEW.latitude IS NULL OR NEW.longitude IS NULL) THEN
    NEW.latitude  := ST_Y(NEW.geo)::numeric(10,7);
    NEW.longitude := ST_X(NEW.geo)::numeric(10,7);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_biens_sync_geo
  BEFORE INSERT OR UPDATE OF latitude, longitude, geo ON "biens"
  FOR EACH ROW EXECUTE FUNCTION biens_sync_geo();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Vérifications post-migration
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ')
    INTO missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relname IN ('biens', 'bien_photos', 'bien_historique')
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tables sans FORCE ROW LEVEL SECURITY : %', missing;
  END IF;
END $$;

DO $$
DECLARE
  geo_exists BOOLEAN;
  gist_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'biens' AND column_name = 'geo'
  ) INTO geo_exists;
  IF NOT geo_exists THEN
    RAISE EXCEPTION 'Colonne biens.geo absente';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'biens' AND indexname = 'biens_geo_gist_idx'
  ) INTO gist_exists;
  IF NOT gist_exists THEN
    RAISE EXCEPTION 'Index GIST biens_geo_gist_idx absent';
  END IF;
END $$;
