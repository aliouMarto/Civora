# CIVORA — Architecture Technique

> Document de référence de l'architecture. À enrichir à chaque étape.

## Principes clés

- Multi-tenant RLS (Row-Level Security PostgreSQL)
- Argent en centimes bigint (jamais float)
- Idempotence sur tous les webhooks et événements de domaine
- Journal d'audit immuable (insert-only)
- Asynchrone via BullMQ pour tout ce qui est lent ou externe
