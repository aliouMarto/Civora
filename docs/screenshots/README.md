# Screenshots — Module Contacts

Captures à produire en local après `pnpm --filter @civora/web dev` + `pnpm --filter @civora/api dev` + seed contacts.

À déposer dans ce dossier :

- `contacts-list.png` — page `/contacts` avec table, filtres et bandeau KPI.
- `contacts-360.png` — page `/contacts/[id]` (onglet Profil).
- `contacts-360-scoring.png` — onglet Scoring avec facteurs détaillés.
- `contacts-ask-kura.png` — modal Ask KURA avec une question + contacts cités.

Procédure recommandée :

```bash
# Terminal 1 — API
pnpm --filter @civora/api dev

# Terminal 2 — Web
pnpm --filter @civora/web dev

# Terminal 3 — seed dev (une fois)
pnpm --filter @civora/api seed:dev
```

Puis ouvrir Chrome DevTools > Lighthouse pour valider les performances (< 1 s
sur le seed dev) et captures plein écran via DevTools (Cmd+Shift+P → "Capture
full size screenshot").
