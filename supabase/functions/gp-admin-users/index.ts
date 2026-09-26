import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SECTION_KEYS = ['effectifs', 'commerces', 'codex', 'finances', 'impots'];
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const AUTH_EMAIL_DOMAIN = Deno.env.get('AUTH_EMAIL_DOMAIN') || 'gardepomme.invalid';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeUsername(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function assertUsername(username: string) {
  if (!/^[a-z0-9_-]{3,32}$/.test(username))
    throw new Error('Identifiant invalide (3 à 32 caractères : lettres minuscules, chiffres, - ou _).');
}

function assertPassword(password: string) {
  if (password.length < 8) throw new Error('Mot de passe trop court (8 caractères minimum).');
}

function normalizeSections(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v || '').trim()).filter((v) => SECTION_KEYS.includes(v)))];
}

async function requireSuperadmin(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Session manquante.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('Session invalide.');
  const { data: profile } = await admin
    .from('gp_profiles')
    .select('is_superadmin')
    .eq('user_id', data.user.id)
    .single();
  if (profile?.is_superadmin !== true) throw new Error('Accès superadmin requis.');
  return data.user;
}

async function createAccount(p: Record<string, unknown>) {
  const username = normalizeUsername(p.username);
  const password = String(p.password || '');
  const displayName = String(p.displayName || '').trim() || username;
  const titre = String(p.titre || '').trim() || null;
  assertUsername(username);
  assertPassword(password);

  const { data: created, error } = await admin.auth.admin.createUser({
    email: `${username}@${AUTH_EMAIL_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName },
  });
  if (error || !created.user) throw error || new Error('Compte non créé.');

  const { error: profileError } = await admin.from('gp_profiles').insert({
    user_id: created.user.id,
    username,
    display_name: displayName,
    titre,
    is_superadmin: p.isSuperadmin === true,
    sections_edit: normalizeSections(p.sectionsEdit),
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw profileError;
  }
  return { user_id: created.user.id, username };
}

async function deleteAccount(p: Record<string, unknown>, callerId: string) {
  const userId = String(p.userId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Identifiant utilisateur invalide.');
  if (userId === callerId) throw new Error('Impossible de supprimer ton propre compte.');
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
  return { user_id: userId };
}

async function resetPassword(p: Record<string, unknown>) {
  const userId = String(p.userId || '').trim();
  const password = String(p.password || '');
  assertPassword(password);
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw error;
  return { user_id: userId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Configuration serveur incomplète.' }, 500);

  try {
    const caller = await requireSuperadmin(req);
    const payload = await req.json();
    const action = String(payload.action || '');
    if (action === 'createAccount') return json({ ok: true, result: await createAccount(payload) });
    if (action === 'deleteAccount') return json({ ok: true, result: await deleteAccount(payload, caller.id) });
    if (action === 'resetPassword') return json({ ok: true, result: await resetPassword(payload) });
    return json({ error: 'Action inconnue.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur.';
    const status = /requis|Session/.test(message) ? 403 : 400;
    return json({ error: message }, status);
  }
});
