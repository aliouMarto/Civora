# CIVORA — PostgreSQL Backup & Restore

## Architecture

```
pg_dump (custom format, level-9) → GPG AES-256 → Cloudflare R2
                                                    ├── daily/    (30 jours)
                                                    └── monthly/  (12 mois)
```

Les sauvegardes sont **chiffrées en transit et au repos** (GPG AES-256 symétrique).
Un test de restauration est exécuté **chaque lundi** en automatique.

> **Un dump non testé n'est pas une sauvegarde. C'est un fichier dans un bucket.**

---

## Calendrier automatique (GitHub Actions)

| Workflow | Déclencheur | Action |
|---|---|---|
| `backup.yml` | Tous les jours à 02:00 UTC | `pg-backup.sh` → R2 |
| `backup.yml` | Chaque lundi à 03:00 UTC | `pg-restore-test.sh` (après backup) |
| `backup.yml` | Manuel (`workflow_dispatch`) | Backup + optionnel restore |

---

## Variables d'environnement requises

Toutes les variables sont des **GitHub Secrets** (environnement `production`) :

| Secret | Description |
|---|---|
| `DATABASE_URL` | URL de connexion PostgreSQL de production |
| `R2_ACCOUNT_ID` | Identifiant du compte Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | Clé d'accès R2 (scope write + delete) |
| `R2_SECRET_ACCESS_KEY` | Secret R2 |
| `R2_BACKUP_BUCKET` | Nom du bucket de sauvegardes (ex: `civora-backups`) |
| `BACKUP_GPG_KEY` | Passphrase GPG (minimum 32 chars aléatoires) |

Variables optionnelles :

| Variable | Défaut | Description |
|---|---|---|
| `BACKUP_RETENTION_DAYS` | `30` | Rétention des sauvegardes quotidiennes |
| `BACKUP_RETENTION_MONTHLY` | `12` | Rétention des sauvegardes mensuelles (mois) |
| `RESTORE_TEST_DB` | `civora_restore_test` | Nom de la base de test temporaire |

---

## Localisation des sauvegardes

```
s3://civora-backups/
├── daily/
│   └── civora-pg-YYYYMMDDTHHMMSSZ.dump.gpg
└── monthly/
    └── civora-pg-YYYYMM.dump.gpg
```

Accès via AWS CLI configuré pour R2 :
```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_DEFAULT_REGION="auto"
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"

# Lister les sauvegardes
aws s3 ls s3://civora-backups/daily/ --endpoint-url "$R2_ENDPOINT" | sort

# Télécharger la plus récente
aws s3 cp s3://civora-backups/daily/<fichier>.dump.gpg . --endpoint-url "$R2_ENDPOINT"
```

---

## Restauration manuelle (procédure pas à pas)

### Pré-requis
- `pg_restore` (même version majeure que le serveur source)
- `gpg`
- `aws` CLI avec accès R2
- Passphrase GPG (`BACKUP_GPG_KEY`)

### Étapes

```bash
# 1. Identifier la sauvegarde à restaurer
aws s3 ls s3://civora-backups/daily/ --endpoint-url "$R2_ENDPOINT" | sort | tail -10

# 2. Télécharger
aws s3 cp "s3://civora-backups/daily/<fichier>.dump.gpg" ./restore.dump.gpg \
  --endpoint-url "$R2_ENDPOINT"

# 3. Déchiffrer
echo "$BACKUP_GPG_KEY" | gpg --batch --passphrase-fd 0 \
  --decrypt --output restore.dump restore.dump.gpg

# 4. Créer une base cible (si restauration vers une nouvelle base)
psql -U civora -c "CREATE DATABASE civora_restored;"

# 5. Restaurer
pg_restore \
  --host=<host> --port=5432 \
  --username=civora \
  --dbname=civora_restored \
  --no-owner --no-acl \
  restore.dump

# 6. Vérifier l'intégrité
psql -U civora -d civora_restored -c "SELECT count(*) FROM agences;"
psql -U civora -d civora_restored -c "SELECT count(*) FROM utilisateurs;"

# 7. Basculer le trafic (si restauration de prod)
# Mettre à jour DATABASE_URL dans les secrets GitHub et redéployer.

# 8. Nettoyer
rm -f restore.dump restore.dump.gpg
```

### Restauration d'urgence sur la base existante

> ⚠️ Cette procédure écrase les données existantes. Ne faire qu'après validation avec le responsable technique.

```bash
# Arrêter l'API pour éviter les écritures concurrentes
docker compose -f docker-compose.prod.yml stop api

# Restaurer (--clean supprime les objets avant de les recréer)
pg_restore \
  --host=<host> --username=civora \
  --dbname=civora \
  --clean --if-exists --no-owner --no-acl \
  restore.dump

# Redémarrer
docker compose -f docker-compose.prod.yml start api
```

---

## Rotation des secrets

### Qui peut rotater ?
- Le responsable technique principal (`@tech-lead`) ou un administrateur GitHub désigné.
- Toute rotation doit être tracée dans un ticket et notifiée dans le canal `#infra`.

### Quand rotater ?
- Rotation systématique : **tous les 6 mois**.
- Rotation d'urgence : si suspicion de compromission, rotation immédiate.

### Procédure de rotation GPG

```bash
# 1. Générer une nouvelle passphrase (min 48 chars)
NEW_KEY=$(openssl rand -base64 48)
echo "Nouvelle clé : $NEW_KEY"   # COPIER IMMÉDIATEMENT

# 2. Re-chiffrer les sauvegardes récentes (30 derniers jours)
for f in $(aws s3 ls s3://civora-backups/daily/ --endpoint-url "$R2_ENDPOINT" | awk '{print $4}'); do
  aws s3 cp "s3://civora-backups/daily/$f" "/tmp/$f" --endpoint-url "$R2_ENDPOINT"
  echo "$OLD_KEY" | gpg --batch --passphrase-fd 0 --decrypt --output "/tmp/$f.dump" "/tmp/$f"
  echo "$NEW_KEY" | gpg --batch --passphrase-fd 0 --symmetric --cipher-algo AES256 \
    --output "/tmp/$f.new" "/tmp/$f.dump"
  aws s3 cp "/tmp/$f.new" "s3://civora-backups/daily/$f" --endpoint-url "$R2_ENDPOINT"
  rm -f "/tmp/$f" "/tmp/$f.dump" "/tmp/$f.new"
done

# 3. Mettre à jour le GitHub Secret BACKUP_GPG_KEY
# (Settings → Secrets → production → BACKUP_GPG_KEY)

# 4. Déclencher un backup+restore manuellement pour valider
# (Actions → Database Backup & Restore → Run workflow → run_restore_test=true)
```

### Procédure de rotation des clés R2

```bash
# 1. Créer de nouvelles clés R2 dans le tableau de bord Cloudflare
# 2. Mettre à jour R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY dans GitHub Secrets
# 3. Déclencher un backup de validation
# 4. Révoquer les anciennes clés
```

---

## Changer la rétention

Modifier les GitHub Secrets ou les variables d'environnement dans `backup.yml` :

```yaml
env:
  BACKUP_RETENTION_DAYS: '60'    # 60 jours quotidiens
  BACKUP_RETENTION_MONTHLY: '24' # 24 mois
```

Ou les passer directement au script :
```bash
BACKUP_RETENTION_DAYS=60 BACKUP_RETENTION_MONTHLY=24 bash infra/backup/pg-backup.sh
```

---

## Vérification manuelle du rapport

Les scripts écrivent un rapport dans `/tmp/civora-backup-report.txt` / `/tmp/civora-restore-report.txt`.
En CI, ces fichiers sont uploadés comme artifacts GitHub Actions (rétention 30 jours).

```bash
# Vérifier le statut après un run manuel
grep BACKUP_STATUS /tmp/civora-backup-report.txt
grep RESTORE_STATUS /tmp/civora-restore-report.txt
```

Résultats attendus :
```
BACKUP_STATUS=SUCCESS
RESTORE_STATUS=SUCCESS
```
