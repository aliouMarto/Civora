# ADR-007 — Passerelle IA générative (multi-fournisseur)

**Statut**: Accepté  
**Date**: 2026-06-24  
**Auteur**: Civora Core Team

---

## Contexte

CIVORA intégrera de l'IA générative dans plusieurs modules métiers (assistant KuRA, génération de relances, OCR, classification de documents, recommandation de biens). Sans abstraction centralisée, chaque module appelle directement OpenAI ou Gemini, ce qui produit :
- Des coûts non contrôlés par agence
- Des prompts dispersés et non versionnés
- Des PII dans les logs et chez les LLM tiers
- Une dépendance hard-codée à un seul fournisseur

---

## Décisions

### 1. API unique `AiGatewayService`

Tous les modules appellent `aiGateway.chat({ template, vars, module })`. Aucun module ne connaît OpenAI ou Gemini. Une règle ESLint (`no-restricted-imports`) interdit les imports directs hors de `_core/ai/providers/`.

### 2. Router multi-fournisseur avec repli

L'`AiRouter` choisit le provider selon `AI_PROVIDER_MODE` :

| Mode | Comportement |
|---|---|
| `fake` | FakeAiProvider — déterministe, sans réseau (dev/test) |
| `gemini` | Gemini primaire, OpenAI fallback |
| `openai` | OpenAI uniquement |
| `auto` | Gemini si GEMINI_API_KEY, sinon OpenAI, sinon fake |

Si le provider primaire retourne 5xx, timeout ou rate-limit → repli automatique sur le secondaire.

### 3. Templates de prompts versionnés

Chaque prompt a un `id` unique et une `version`. Les modules n'écrivent jamais de prompt inline — ils référencent un template du catalogue. Modifier un prompt = incrémenter `version`.

Attributs de sécurité par template :
- `sensitive: true` → refus sans `allowSensitive: true` explicite (données financières)
- `anonymize: true` → masquage automatique des emails/téléphones avant envoi au LLM

### 4. Traçabilité : table `ai_calls`

Chaque appel persiste une ligne avec : provider, model, tokens, coût, latence, statut, hash du prompt (pas le prompt complet par défaut). Permet l'analyse A/B de templates et le suivi des coûts.

### 5. Plafonds budget par agence

`BudgetService` maintient un compteur mensuel en centimes USD par agence (`ai_budgets`). Si `used_cents + estimatedCents > monthly_limit_cents`, l'appel est refusé avec status `blocked_by_budget` et `BudgetExceededError`. Le plafond par défaut est **10 USD/mois** (1000¢), reconfigurable par agence.

### 6. RAG avec pgvector

Les documents sont découpés en chunks (512 chars, overlap 64), embedés, et stockés dans `ai_embeddings` avec `vector(1536)`.

**Taille de vecteur : 1536** — Compatible avec :
- OpenAI `text-embedding-3-small` (1536 natif)
- Gemini `text-embedding-004` (768 → padded à 1536 par duplication symétrique)

Ce choix permet de mixer les providers pour l'embedding sans changer le schéma DB.

L'index HNSW (`vector_cosine_ops`, m=16, ef_construction=64) permet une recherche approximative rapide sur des millions de chunks.

Les requêtes `retrieval.search()` sont filtrées par `agence_id` (RLS + clause WHERE) — isolation inter-tenant garantie.

---

## Architecture

```
Module métier
  │
  └── AiGatewayService.chat({ template:'smoke.hello', vars, module })
        │
        ├── PromptCatalogService.get('smoke.hello')   → vérifie version, sensitive, anonymize
        ├── BudgetService.check(agence_id, tokens)    → BudgetExceededError si dépassé
        ├── AiRouter.route('chat')                    → { primary: Gemini, fallback: OpenAI }
        ├── GeminiProvider.chat(messages)             → ChatResult
        │     └── [timeout/5xx] → OpenAiProvider.chat(messages)
        ├── AiUsageService.record(...)                → AiCall en DB
        └── BudgetService.record(agence_id, cost)

Module RAG
  │
  ├── EmbeddingsService.store({ sourceType, sourceId, text })
  │     └── chunkText() → embed() → INSERT ai_embeddings (vector 1536)
  │
  └── RetrievalService.search({ query, topK })
        └── embed(query) → SELECT ... ORDER BY embedding <=> query LIMIT k
```

---

## Alternatives rejetées

| Alternative | Raison |
|---|---|
| LangChain.js | Abstraction trop lourde, mauvais support ESM, overhead pour notre cas |
| Appels directs par module | Dispersion des coûts, pas de versioning, PII incontrôlées |
| Taille vecteur 768 (Gemini natif) | Incompatible avec OpenAI text-embedding-3-small ; nécessiterait 2 colonnes |
| Taille vecteur 3072 (OpenAI large) | Coût stockage × 2 sans gain significatif pour notre domaine |
| Conserver les prompts complets dans les logs | RGPD / confidentialité : on stocke uniquement le hash SHA-256 (16 chars) |

---

## Critères d'acceptation

- [x] `AiGateway.chat()` : template, vars, usage, coût, provider retournés
- [x] Template sensitive sans `allowSensitive` → ForbiddenException
- [x] Template inexistant → NotFoundException
- [x] Budget dépassé → status `blocked_by_budget` + BudgetExceededError
- [x] Provider primaire timeout → repli automatique sur secondaire
- [x] Anonymisation : email masqué en `<email>` pour templates `anonymize:true`
- [x] ESLint rule : import direct openai/@google/generative-ai bloqué hors providers/
- [x] `EmbeddingsService.store()` : DELETE + INSERT chunks (vecteur 1536 dims)
- [x] `RetrievalService.search()` : filtre par agence_id, retourne similarity
- [x] RLS sur `ai_calls`, `ai_embeddings`, `ai_budgets`
- [x] `AI_PROVIDER_MODE=fake` en dev (aucun coût, aucun réseau)
- [x] 21 tests : gateway (8) + budget (5) + RAG/chunking (8)
