# Importer vos contacts dans CIVORA

Cette page explique comment importer un fichier CSV ou Excel de contacts
existants dans votre agence — typiquement lors de l'onboarding ou pour migrer
depuis un ancien outil.

## En 4 minutes

1. Ouvrez **Contacts** dans le menu principal.
2. Cliquez sur **Importer** (en haut à droite).
3. Glissez votre fichier (CSV ou XLSX, max 50 Mo).
4. Vérifiez le mapping suggéré → cliquez **Aperçu**.
5. Vérifiez les 5 premières lignes → cliquez **Lancer l'import**.
6. Consultez le rapport final, téléchargez les lignes en erreur si besoin.

> Astuce : la progression est affichée en temps réel. Vous pouvez fermer
> l'onglet et revenir plus tard, l'import continue côté serveur.

## Format de fichier accepté

- **CSV** (séparateur virgule, encodage UTF-8 recommandé — un BOM est toléré).
- **XLSX** (Excel moderne).
- 50 Mo maximum. Au-delà, contactez votre référent CIVORA pour un import assisté.

## Colonnes reconnues automatiquement

CIVORA détecte automatiquement vos colonnes même si elles portent des noms
différents (français/anglais, accents, espaces). Voici la liste des champs
ciblés et les variantes qui matchent :

| Champ CIVORA | Variantes reconnues |
|---|---|
| `nom` | Nom, Lastname, Surname, Nom de famille |
| `prenom` | Prénom, Firstname, Given name |
| `email` | Email, Mail, Courriel, E-mail |
| `telephone` | Téléphone, Tel, Phone, Mobile, GSM, Portable |
| `whatsapp` | WhatsApp, WA |
| `whatsapp_opt_in` | WhatsApp opt-in, Consentement (valeurs : oui/non/true/false/1/0) |
| `ville` | Ville, City, Localité |
| `commune` | Commune, Quartier, District |
| `pays` | Pays, Country (code ISO 2 lettres : `CI`, `FR`…) |
| `roles` | Rôles, Type, Catégorie (séparés par `,` ou `;`) |
| `source` | Source, Origine, Channel, Canal |
| `tags` | Tags, Mots-clés, Keywords (séparés par `,` ou `;`) |

Si une colonne n'est pas reconnue, sélectionnez-la manuellement dans l'étape
**Mapping** du wizard.

## Règles de validation

Une ligne est **importée** si :

- Elle contient un `nom`.
- Elle contient au moins **un canal de contact** : `email` valide OU `téléphone` au format international (E.164, par exemple `+2250707070707`).
- Les valeurs respectent les contraintes :
  - `email` au format `prenom@domaine.tld`
  - `telephone` et `whatsapp` au format E.164 (le pays par défaut est CI : `0707070707` devient automatiquement `+2250707070707`)
  - `roles` parmi : `prospect`, `locataire`, `proprietaire`, `acheteur`, `voyageur`, `partenaire`
  - `source` parmi : `portail`, `reseau`, `walk_in`, `referencement`, `site_web`, `import`, `autre`
  - `pays` : code ISO 3166-1 alpha-2 (`CI`, `FR`, `SN`…)

Toute ligne non conforme apparaît dans le **rapport d'erreurs** avec une
explication précise (« email invalide », « téléphone non E.164 », etc.).

## Comportement face aux doublons

CIVORA détecte automatiquement les doublons sur **email** OU **téléphone**
(normalisés) au sein de l'agence. Vous choisissez l'action :

| Option | Effet |
|---|---|
| **Ignorer les doublons** (défaut recommandé) | La ligne en doublon est ignorée, comptée dans `Ignorés` |
| **Mettre à jour les doublons** | La ligne en doublon écrase les champs existants (utile pour réimporter une liste enrichie) |
| (aucune des deux) | La ligne en doublon est rejetée et apparaît dans le rapport d'erreurs |

## Rapport d'erreurs

À la fin de l'import, si des lignes ont échoué, un bouton **Télécharger**
vous propose un CSV contenant :

- `ligne` : numéro dans votre fichier source
- `erreur` : message explicatif (plusieurs erreurs séparées par ` ; `)
- `nom`, `email`, `telephone` : la valeur d'origine pour vous aider à corriger

Vous pouvez corriger votre fichier source puis relancer un import — les
contacts déjà importés ne seront pas recréés (grâce au dédoublonnage).

## Confidentialité & sécurité

- Le fichier source est stocké de manière chiffrée sur Cloudflare R2.
- Il est **automatiquement supprimé après 7 jours**.
- L'import s'exécute avec le rôle base de données restreint à votre agence
  (RLS PostgreSQL) : il est techniquement impossible qu'une ligne aboutisse
  dans une autre agence, même en cas de bug.
- L'opération est tracée dans le journal d'audit (qui, quand, combien de lignes).

## Limitations actuelles

- Pas d'import des **interactions** (à venir en R2 — pour l'instant, l'import
  ne crée que les contacts).
- Pas d'import d'images d'avatar.
- Maximum 50 Mo par fichier.

## Astuces

- **Préparez un petit échantillon** (10 lignes) pour valider le mapping avant
  d'importer 10 000 lignes.
- **Forcez le codage UTF-8** dans Excel : *Enregistrer sous → CSV UTF-8*.
- Pour les **rôles multiples**, séparez par `;` dans la cellule : `prospect;acheteur`.
- Pour les **téléphones internationaux**, préférez le format E.164 (`+221…`,
  `+33…`) pour éviter toute ambiguïté.

---

*Dernière mise à jour : Lot 1 · Module 1 · Étape 5.*
