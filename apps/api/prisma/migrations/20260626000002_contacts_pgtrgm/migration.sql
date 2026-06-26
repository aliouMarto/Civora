-- Migration : contacts_pgtrgm
-- Lot 1 · Module 1 · Etape 2 — extension pg_trgm + soft delete + index full-text.
--
-- 1. Ajoute la colonne archived_at sur contacts (soft delete).
-- 2. Active l'extension pg_trgm pour la recherche fuzzy.
-- 3. Crée des index GIN trigram sur nom, prenom, email pour le filtre `q`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Soft delete
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "contacts"
  ADD COLUMN "archived_at" TIMESTAMPTZ;

-- Index partiel : les requêtes "non archivés" sont les plus fréquentes,
-- l'index ne couvre que les lignes archivées (lookup rapide quand on cherche
-- explicitement les archives) ; les lectures non archivées passent par les
-- autres index existants combinés avec `archived_at IS NULL`.
CREATE INDEX "contacts_agence_archived_idx"
  ON "contacts" ("agence_id", "archived_at")
  WHERE "archived_at" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Extension pg_trgm pour recherche fuzzy
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Index GIN trigram sur nom, prenom, email
--    Permettent les requêtes ILIKE '%bamba%' et la fonction similarity()
--    en O(log n) au lieu de Seq Scan.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX "contacts_nom_trgm_idx"
  ON "contacts" USING GIN ("nom" gin_trgm_ops);

CREATE INDEX "contacts_prenom_trgm_idx"
  ON "contacts" USING GIN ("prenom" gin_trgm_ops);

CREATE INDEX "contacts_email_trgm_idx"
  ON "contacts" USING GIN ("email" gin_trgm_ops);

-- Vérification post-migration
DO $$
DECLARE
  ext_exists BOOLEAN;
  idx_count INT;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') INTO ext_exists;
  IF NOT ext_exists THEN
    RAISE EXCEPTION 'Extension pg_trgm absente';
  END IF;

  SELECT count(*) INTO idx_count
    FROM pg_indexes
   WHERE tablename = 'contacts'
     AND indexname IN ('contacts_nom_trgm_idx', 'contacts_prenom_trgm_idx', 'contacts_email_trgm_idx');
  IF idx_count <> 3 THEN
    RAISE EXCEPTION 'Index trigram manquants (% sur 3)', idx_count;
  END IF;
END $$;
