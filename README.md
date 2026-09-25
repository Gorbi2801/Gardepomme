# Livret de Gardepomme

Registres administratifs de la baronnie de Gardepomme : effectifs et salaires, commerces, codex des lois, trésor et impôts.
Lecture publique sans compte ; modification réservée aux comptes créés par le superadmin, section par section.

Stack : HTML/CSS/JS sans framework, Supabase (base + auth + Edge Function), GitHub Pages via GitHub Actions — même principe que le Grimoire de la Garde de l'Aube.

## Arborescence

```
index.html
styles/main.css
assets/blason.svg
scripts/
  config.example.js      modèle ; le vrai config.js est généré par GitHub Actions
  core.js                client Supabase, droits, formulaires, modale
  auth.js                connexion par identifiant
  ui.js                  navigation, tri, filtres, export CSV
  sections/              accueil, effectifs, commerces, codex, finances, impots, journal, comptes
  bootstrap.js           démarrage (chargé en dernier)
supabase/
  sql/01_schema.sql      tables gp_*, sécurité RLS, historique automatique
  functions/gp-admin-users/index.ts   création / suppression / reset des comptes
  config.toml
.github/workflows/deploy.yml
```

## Installation

### 1. Supabase

Nouveau projet, ou le même que le Grimoire : tout est préfixé `gp_`, rien n'entre en collision.

1. **SQL Editor** → colle et exécute `supabase/sql/01_schema.sql`.
2. **Authentication → Sign In / Providers → Email** : désactive « Allow new users to sign up » (seul le superadmin crée des comptes).
3. **Edge Function** (depuis le dossier du repo, avec la CLI Supabase) :
   ```
   supabase link --project-ref TON_PROJECT_REF
   supabase secrets set AUTH_EMAIL_DOMAIN=gardepomme.invalid
   supabase functions deploy gp-admin-users
   ```
4. **Premier superadmin** : Authentication → Users → Add user → Create new user,
   email `baron@gardepomme.invalid`, mot de passe au choix, « Auto Confirm User » coché.
   Puis exécute le bloc commenté en bas de `01_schema.sql` (décommenté).

### 2. GitHub

Dans le repo **Gardepomme** :

1. **Settings → Secrets and variables → Actions → New repository secret** :
   - `SUPABASEURL` : `https://TON_PROJECT_REF.supabase.co`
   - `SUPABASEKEY` : la clé **publishable / anon** (jamais la service_role)
   - `AUTHEMAILDOMAIN` : `gardepomme.invalid` (doit être identique au secret de l'Edge Function)
2. **Settings → Pages → Source : GitHub Actions**.
3. Pousse sur `main` : le workflow génère `scripts/config.js` et déploie.

### Test en local

Copie `scripts/config.example.js` en `scripts/config.js`, remplis-le, puis ouvre le dossier avec un petit serveur
(`npx serve .` ou l'extension Live Server). `config.js` est dans le `.gitignore`.

## Droits

| Qui | Peut |
|---|---|
| Visiteur sans compte | Tout lire (sauf Historique et Comptes) |
| Compte connecté | Lire l'historique ; modifier uniquement les sections cochées sur son compte |
| Superadmin | Tout modifier, créer / supprimer des comptes, changer les mots de passe |

Les droits sont appliqués **côté base** (RLS), pas seulement dans l'interface.
Un éditeur des Effectifs peut verser la paie ; un éditeur des Impôts peut payer un impôt et percevoir les taxes : ces opérations s'inscrivent au Trésor même sans droit sur le Trésor.

## Historique

Chaque ajout, modification ou suppression est journalisé automatiquement par un trigger (`gp_journal`), avec l'auteur.
Depuis l'historique, un compte ayant le droit sur la section peut annuler un ajout, rétablir une ancienne version ou restaurer une entrée supprimée.
