-- Extensions activées au démarrage de Postgres
-- PostGIS est déjà inclus dans l'image postgis/postgis mais on s'assure qu'il est activé
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- pgvector : recherche vectorielle pour le service IA
CREATE EXTENSION IF NOT EXISTS vector;

-- pgcrypto : UUIDs et fonctions cryptographiques
CREATE EXTENSION IF NOT EXISTS pgcrypto;
