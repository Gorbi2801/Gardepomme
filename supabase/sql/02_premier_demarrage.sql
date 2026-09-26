-- ══════════════════════════════════════════════════════════════════════
--  LIVRET DE GARDEPOMME — 02_premier_demarrage.sql
--  À exécuter UNE FOIS dans Supabase > SQL Editor,
--  après avoir exécuté 01_schema.sql.
--
--  Ajoute une fonction accessible sans connexion pour que le site puisse
--  détecter qu'aucun superadmin n'existe encore et afficher le formulaire
--  de configuration initiale.
-- ══════════════════════════════════════════════════════════════════════

-- Vérifie si au moins un superadmin existe (accessible sans compte)
create or replace function public.gp_has_superadmin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.gp_profiles where is_superadmin = true);
$$;

revoke all on function public.gp_has_superadmin() from public;
grant execute on function public.gp_has_superadmin() to anon, authenticated;
