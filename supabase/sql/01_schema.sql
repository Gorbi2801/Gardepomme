-- ══════════════════════════════════════════════════════════════════════
--  LIVRET DE GARDEPOMME — Schéma complet
--  À exécuter UNE FOIS dans Supabase > SQL Editor (ré-exécutable sans casse).
--  Préfixe gp_ : aucune collision possible avec les tables mk_ du Grimoire
--  si tu utilises le même projet Supabase.
-- ══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────
--  COMPTES
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.gp_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  username       text not null unique,
  display_name   text not null,
  titre          text,                       -- ex : Baron, Intendant, Capitaine
  is_superadmin  boolean not null default false,
  sections_edit  text[] not null default '{}',  -- effectifs, commerces, codex, finances, impots
  created_at     timestamptz not null default now()
);

create or replace function public.gp_is_superadmin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.gp_profiles where user_id = auth.uid() and is_superadmin);
$$;

create or replace function public.gp_can_edit(section_key text)
returns boolean language sql security definer stable set search_path = public as $$
  select public.gp_is_superadmin()
      or exists (select 1 from public.gp_profiles p
                 where p.user_id = auth.uid() and section_key = any(p.sections_edit));
$$;

create or replace function public.gp_current_name()
returns text language sql security definer stable set search_path = public as $$
  select coalesce((select display_name from public.gp_profiles where user_id = auth.uid()), 'Inconnu');
$$;

revoke all on function public.gp_is_superadmin() from public;
revoke all on function public.gp_can_edit(text) from public;
revoke all on function public.gp_current_name() from public;
grant execute on function public.gp_is_superadmin() to anon, authenticated;
grant execute on function public.gp_can_edit(text) to anon, authenticated;
grant execute on function public.gp_current_name() to authenticated;

-- ─────────────────────────────────────────────────────────────────────
--  EFFECTIFS (gardes, intendance, maison du baron, employés)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.gp_membres (
  id          uuid primary key default gen_random_uuid(),
  prenom      text not null,
  nom         text,
  race        text,
  categorie   text not null default 'Garde',
  fonction    text,
  salaire     bigint not null default 0 check (salaire >= 0),
  statut      text not null default 'Actif',
  date_entree date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────
--  COMMERCES
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.gp_commerces (
  id           uuid primary key default gen_random_uuid(),
  nom          text not null,
  activite     text,
  proprietaire text,
  membres      text,              -- un nom par ligne
  emplacement  text,
  benefice     bigint not null default 0,  -- bénéfice déclaré par période
  statut       text not null default 'Ouvert',
  exonere      boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────
--  CODEX (bibliothèque des lois)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.gp_lois (
  id          uuid primary key default gen_random_uuid(),
  titre       text not null,
  categorie   text not null default 'Lois de Bruma',
  reference   text,              -- ex : Art. 4, Édit n°2
  contenu     text not null default '',
  source      text,              -- promulgué par / date
  ordre       integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────
--  FINANCES
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.gp_operations (
  id           uuid primary key default gen_random_uuid(),
  date_op      date not null default current_date,
  sens         text not null check (sens in ('Recette','Dépense')),
  categorie    text not null default 'Autre',
  libelle      text not null,
  montant      bigint not null check (montant >= 0),
  details      text,             -- lignes du négoce, liste de paie…
  commerce_id  uuid references public.gp_commerces(id) on delete set null,
  impot_id     uuid,
  auteur       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.gp_catalogue (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  categorie   text,
  unite       text default 'unité',
  prix_achat  bigint not null default 0,
  prix_vente  bigint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────
--  IMPÔTS (dus au Comté) + PARAMÈTRES
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.gp_impots (
  id            uuid primary key default gen_random_uuid(),
  libelle       text not null,
  beneficiaire  text not null default 'Comté de Bruma',
  montant       bigint not null check (montant >= 0),
  echeance      date,
  periode       text,
  statut        text not null default 'À payer' check (statut in ('À payer','Payé')),
  paye_le       date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.gp_parametres (
  cle         text primary key,
  valeur      text not null,
  updated_at  timestamptz not null default now()
);

insert into public.gp_parametres (cle, valeur) values
  ('taux_taxe_commerce', '10'),
  ('periode_label', 'semaine')
on conflict (cle) do nothing;

-- ─────────────────────────────────────────────────────────────────────
--  JOURNAL (historique automatique de toutes les modifications)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.gp_journal (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid,
  auteur      text,
  table_name  text not null,
  action      text not null,         -- INSERT / UPDATE / DELETE
  row_id      text,
  label       text,
  old_data    jsonb,
  new_data    jsonb
);
create index if not exists gp_journal_table_idx on public.gp_journal(table_name, created_at desc);

create or replace function public.gp_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.gp_journal (user_id, auteur, table_name, action, row_id, label, old_data, new_data)
  values (
    auth.uid(),
    public.gp_current_name(),
    tg_table_name,
    tg_op,
    coalesce(rec->>'id', rec->>'cle'),
    coalesce(rec->>'libelle', rec->>'titre', rec->>'nom',
             trim(coalesce(rec->>'prenom','') || ' ' || coalesce(rec->>'nom','')), rec->>'cle'),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

create or replace function public.gp_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.gp_set_auteur()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.auteur := public.gp_current_name(); end if;
  return new;
end $$;

drop trigger if exists gp_operations_auteur on public.gp_operations;
create trigger gp_operations_auteur before insert on public.gp_operations
  for each row execute function public.gp_set_auteur();

do $$
declare t text;
begin
  foreach t in array array['gp_membres','gp_commerces','gp_lois','gp_operations','gp_catalogue','gp_impots','gp_parametres'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_log', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.gp_log()', t || '_log', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.gp_touch()', t || '_touch', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────
--  SÉCURITÉ (RLS)
--  Lecture : tout le monde, même sans compte (lecture publique du livret).
--  Écriture : uniquement les comptes ayant le droit sur la section.
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  pair text[];
  pairs text[][] := array[
    array['gp_membres','effectifs'],
    array['gp_commerces','commerces'],
    array['gp_lois','codex'],
    array['gp_operations','finances'],
    array['gp_catalogue','finances'],
    array['gp_impots','impots'],
    array['gp_parametres','impots']
  ];
begin
  foreach pair slice 1 in array pairs loop
    execute format('alter table public.%I enable row level security', pair[1]);
    execute format('drop policy if exists "gp lecture publique" on public.%I', pair[1]);
    execute format('create policy "gp lecture publique" on public.%I for select to anon, authenticated using (true)', pair[1]);
    execute format('drop policy if exists "gp ajout" on public.%I', pair[1]);
    execute format('create policy "gp ajout" on public.%I for insert to authenticated with check (public.gp_can_edit(%L))', pair[1], pair[2]);
    execute format('drop policy if exists "gp modif" on public.%I', pair[1]);
    execute format('create policy "gp modif" on public.%I for update to authenticated using (public.gp_can_edit(%L)) with check (public.gp_can_edit(%L))', pair[1], pair[2], pair[2]);
    execute format('drop policy if exists "gp suppr" on public.%I', pair[1]);
    execute format('create policy "gp suppr" on public.%I for delete to authenticated using (public.gp_can_edit(%L))', pair[1], pair[2]);
  end loop;
end $$;

-- La paie (dépense "Salaires") est enregistrée depuis Effectifs :
-- un éditeur des effectifs peut donc aussi ajouter une opération de catégorie Salaires.
drop policy if exists "gp ajout paie" on public.gp_operations;
create policy "gp ajout paie" on public.gp_operations for insert to authenticated
  with check (categorie = 'Salaires' and public.gp_can_edit('effectifs'));
-- Idem : payer un impôt / percevoir une taxe depuis l'onglet Impôts.
drop policy if exists "gp ajout impots" on public.gp_operations;
create policy "gp ajout impots" on public.gp_operations for insert to authenticated
  with check (categorie in ('Impôts','Taxes commerciales') and public.gp_can_edit('impots'));

-- Profils : chacun lit le sien, le superadmin lit et modifie tout.
alter table public.gp_profiles enable row level security;
drop policy if exists "gp profil lecture" on public.gp_profiles;
create policy "gp profil lecture" on public.gp_profiles for select to authenticated
  using (user_id = auth.uid() or public.gp_is_superadmin());
drop policy if exists "gp profil modif" on public.gp_profiles;
create policy "gp profil modif" on public.gp_profiles for update to authenticated
  using (public.gp_is_superadmin()) with check (public.gp_is_superadmin());

-- Journal : visible par les comptes connectés uniquement, jamais modifiable à la main.
alter table public.gp_journal enable row level security;
drop policy if exists "gp journal lecture" on public.gp_journal;
create policy "gp journal lecture" on public.gp_journal for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────
--  PREMIER SUPERADMIN (à faire une seule fois)
--  1. Supabase > Authentication > Users > Add user > Create new user
--     Email : baron@gardepomme.invalid (identifiant "baron" + ton AUTH_EMAIL_DOMAIN)
--     Mot de passe au choix, coche "Auto Confirm User".
--  2. Décommente et exécute :
-- ─────────────────────────────────────────────────────────────────────
-- insert into public.gp_profiles (user_id, username, display_name, titre, is_superadmin, sections_edit)
-- select id, 'baron', 'Haldor Blancerf', 'Baron de Gardepomme', true,
--        array['effectifs','commerces','codex','finances','impots']
-- from auth.users where email = 'baron@gardepomme.invalid'
-- on conflict (user_id) do update set is_superadmin = true;
