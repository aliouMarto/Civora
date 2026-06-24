-- Migration initiale : activation des extensions PostgreSQL
-- Ces extensions sont nécessaires pour PostGIS (géolocalisation), pgvector (IA) et pgcrypto (UUIDs)

CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "postgis_topology";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
