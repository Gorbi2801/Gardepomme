# Livret de Gardepomme

Registres administratifs de la baronnie de Gardepomme : effectifs et salaires, commerces, codex des lois, trésor et impôts.
Lecture publique sans compte ; modification réservée aux comptes créés par le superadmin, section par section.

Stack : HTML/CSS/JS sans framework, Supabase (base + auth + Edge Function), GitHub Pages via GitHub Actions — même principe que le Grimoire de la Garde de l'Aube.

## Installation

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
