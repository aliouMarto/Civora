# ADR-005 — Stockage de fichiers : Cloudflare R2 (prod) / MinIO (dev)

**Statut**: Accepté  
**Date**: 2026-06-24  
**Auteur**: Civora Core Team

---

## Contexte

CIVORA doit stocker des fichiers volumineux et sensibles : photos de biens, baux PDF, pièces d'identité, relevés bancaires, rapports comptables. Ces fichiers doivent être :
- Isolés par tenant (une agence ne peut pas accéder aux fichiers d'une autre)
- Inaccessibles publiquement (URLs signées uniquement)
- Validés côté serveur avant génération de toute URL d'upload
- Auditables (qui a uploadé quoi, quand)

---

## Décisions

### 1. Cloudflare R2 en production, MinIO en dev

**R2** : API S3-compatible, gratuit jusqu'à 10 Go, pas d'egress fees, edge global.  
**MinIO** : démarré via Docker Compose, bucket `civora-dev`, identique à l'API R2.

AWS SDK v3 (modulaire, ESM) gère les deux sans changement de code.

### 2. Bucket privé + URLs signées de courte durée (5 min)

**Règle absolue** : aucun objet n'est accessible publiquement. Toutes les URLs (upload PUT et download GET) sont signées et expirent en 5 minutes.

Pourquoi 5 min ?
- Assez long pour un upload côté client sur connexion lente
- Assez court pour limiter la fenêtre d'exploitation en cas de fuite d'URL

### 3. Clés prefixées par agence_id — isolation par préfixe

```
tenants/<agence_id>/<entite_id?>/<kind>/<yyyy>/<mm>/<uuid>.<ext>
```

Exemples :
- `tenants/abc.../baux/2025/06/uuid.pdf`
- `tenants/abc.../ent-xyz/photo_bien/2025/06/uuid.jpg`

Avant de signer une URL de download ou delete, le serveur vérifie que la clé commence par `tenants/<agence_id>/`. Cela empêche une agence de demander une URL signée pour un fichier d'une autre agence.

**Sécurité** : le check est `key.startsWith('tenants/<agence_id>/')` — avec le slash final — pour éviter qu'un `agence_id` préfixe d'un autre soit accepté (`agence-abc` ne donne pas accès à `agence-abc-evil`).

### 4. Validation côté serveur par kind

Chaque `kind` de fichier a une politique :

| Kind | Types autorisés | Taille max |
|------|----------------|------------|
| `photo_bien` | image/jpeg, png, webp, gif | 10 Mo |
| `bail` | application/pdf | 20 Mo |
| `quittance` | application/pdf | 5 Mo |
| `piece_identite` | pdf, jpeg, png | 5 Mo |
| `rapport` | pdf, xlsx | 50 Mo |
| `temp` | pdf, jpeg, png, webp | 20 Mo |

La validation se fait **avant** de générer l'URL signée. Le client reçoit un 400 avec le message d'erreur avant d'avoir gaspillé une URL.

### 5. Audit

Chaque opération est loggée structurellement :
- `upload-url-generated: <kind>/<key> (agence=<id>)`
- `download-url-generated: key=<key> (agence=<id>)`
- `object-deleted: key=<key> (agence=<id>)`
- `download-url-refused: key="<key>" ne appartient pas à agence=<id>` (WARNING)

---

## Architecture

```
Client (navigateur / mobile)
  │
  ├── POST /storage/upload-url  → StorageService.getUploadUrl()
  │     ✓ Valide kind, contentType, sizeBytes
  │     ✓ Génère clé : tenants/<agence>/<kind>/<uuid>.<ext>
  │     ✓ Signe PUT via getSignedUrl (AWS SDK v3)
  │     → { url, key, expiresAt }
  │
  ├── PUT <url signée>          → directement vers R2/MinIO (pas via le serveur)
  │
  └── GET /storage/download-url?key=<key>
        ✓ Vérifie keyBelongsToAgence(key, agence_id)
        ✓ Signe GET via getSignedUrl
        → { url, expiresAt }
```

---

## Alternatives rejetées

| Alternative | Raison |
|---|---|
| Upload direct vers le serveur puis vers R2 | Double bande passante, serveur goulot |
| URLs publiques dans le bucket | Violation de confidentialité (baux, pièces d'identité) |
| AWS S3 | Egress fees, plus cher que R2 |
| Google Cloud Storage | Pas de tier gratuit comparable |
| Stockage local filesystem | Pas scalable, pas de HA, perte sur redéploiement |

---

## Critères d'acceptation

- [x] URL signée PUT expire dans 5 min
- [x] URL signée GET refuse une clé d'une autre agence (403)
- [x] contentType non autorisé → 400 explicite
- [x] Fichier trop volumineux → 400 avec taille max
- [x] Clé préfixe-sécurisée (`agence-abc` n'accède pas à `agence-abc-evil`)
- [x] MinIO configuré dans docker-compose, bucket privé auto-créé
- [x] Audit : upload/download/delete tracés dans les logs
- [x] 32 tests : clés, isolation tenant, politique kind, URLs signées
