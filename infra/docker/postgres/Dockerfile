# PostgreSQL 16 + PostGIS 3.4 + pgvector
# CIVORA a besoin des deux extensions :
#   - PostGIS (geometry, GIST, ST_DWithin) → module Biens
#   - pgvector (embeddings IA) → modules Contacts/Biens/IA
#
# L'image officielle postgis/postgis n'inclut pas pgvector, on l'ajoute via apt.

FROM postgis/postgis:16-3.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*
