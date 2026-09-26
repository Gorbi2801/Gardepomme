// ══════════════════════════════════════════════════════════════════════
//  DÉMARRAGE — chargé en dernier
// ══════════════════════════════════════════════════════════════════════
(async function init() {
  if (!window.GardepommeConfig?.supabaseUrl || !window.GardepommeConfig?.supabaseKey) {
    document.getElementById('page').innerHTML = `
      <section class="sheet" role="alert" style="margin:2rem;padding:1.5rem">
        <h2>Configuration Supabase introuvable</h2>
        <p>Vérifie les secrets GitHub (<code>SUPABASEURL</code>, <code>SUPABASEKEY</code>)
        et relance le workflow.</p>
      </section>`;
    return;
  }
  if (!window.supabase?.createClient) {
    document.getElementById('page').innerHTML =
      '<section class="sheet" role="alert" style="margin:2rem;padding:1.5rem"><h2>Bibliothèque Supabase indisponible</h2><p>Vérifie ta connexion.</p></section>';
    return;
  }

  document.addEventListener('keydown', e => {
    const modalOpen = !document.getElementById('modal').hidden;
    if (e.key === 'Escape' && modalOpen) closeModal();
    if (e.key === 'Enter' && modalOpen && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
      e.preventDefault(); modalOk();
    }
  });
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
  });

  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h !== activeSection && SECTIONS[h]) go(h);
  });

  const hash = location.hash.replace('#', '');
  if (SECTIONS[hash]) activeSection = hash;

  // Vérifie si un superadmin existe déjà
  try {
    const { count } = await sb
      .from('gp_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_superadmin', true);
    if (count === 0) {
      showFirstSetup();
      return;
    }
  } catch (_) {}

  await loadSession();
  await refreshAll();
})();

// ── Écran de configuration initiale ──────────────────────────────────
function showFirstSetup() {
  document.getElementById('nav').innerHTML = '';
  document.getElementById('session-box').innerHTML = '';
  document.getElementById('page').innerHTML = `
    <div class="setup-wrap">
      <div class="setup-card">
        <img src="assets/blason.svg" alt="Blason de Gardepomme" width="64" height="74"
             style="display:block;margin:0 auto 1.2rem">
        <h2>Configuration initiale</h2>
        <p class="lead-in">Aucun compte n'existe encore. Crée le compte du baron — il aura
        accès à tout le livret et pourra créer d'autres comptes ensuite.</p>
        <div class="form-grid">
          <div class="field">
            <label for="su-user">Identifiant de connexion <span class="req">*</span></label>
            <input id="su-user" autocomplete="username" autocapitalize="off" placeholder="ex : baron">
            <small>3 à 32 caractères : minuscules, chiffres, - ou _</small>
          </div>
          <div class="field">
            <label for="su-name">Nom affiché <span class="req">*</span></label>
            <input id="su-name" placeholder="ex : Haldor Blancerf">
          </div>
          <div class="field full">
            <label for="su-titre">Titre</label>
            <input id="su-titre" value="Baron de Gardepomme">
          </div>
          <div class="field">
            <label for="su-pass">Mot de passe <span class="req">*</span></label>
            <input id="su-pass" type="password" autocomplete="new-password">
            <small>8 caractères minimum</small>
          </div>
          <div class="field">
            <label for="su-pass2">Confirmer <span class="req">*</span></label>
            <input id="su-pass2" type="password" autocomplete="new-password">
          </div>
        </div>
        <p id="su-err" class="modal-err" role="alert"></p>
        <div style="display:flex;justify-content:flex-end;margin-top:1rem">
          <button class="btn btn-primary" id="su-btn" onclick="doFirstSetup()">
            Créer le compte superadmin
          </button>
        </div>
      </div>
    </div>`;
}

async function doFirstSetup() {
  const username  = document.getElementById('su-user').value.trim().toLowerCase();
  const displayName = document.getElementById('su-name').value.trim();
  const titre     = document.getElementById('su-titre').value.trim();
  const password  = document.getElementById('su-pass').value;
  const password2 = document.getElementById('su-pass2').value;
  const err = msg => { document.getElementById('su-err').textContent = msg; };

  if (!username)  return err('L\'identifiant est obligatoire.');
  if (!/^[a-z0-9_-]{3,32}$/.test(username)) return err('Identifiant invalide (minuscules, chiffres, - ou _).');
  if (!displayName) return err('Le nom affiché est obligatoire.');
  if (password.length < 8) return err('Mot de passe trop court (8 caractères minimum).');
  if (password !== password2) return err('Les deux mots de passe ne correspondent pas.');

  const btn = document.getElementById('su-btn');
  btn.disabled = true;
  btn.textContent = 'Création en cours…';
  err('');

  try {
    // 1. Créer le compte via signUp (pas besoin d'Edge Function)
    const { data: authData, error: authErr } = await sb.auth.signUp({
      email: `${username}@${CFG.authEmailDomain}`,
      password,
    });
    if (authErr) throw authErr;
    if (!authData.user) throw new Error('Compte non créé. Vérifie que "Confirm email" est désactivé dans Supabase → Authentication → Providers → Email.');

    // 2. Insérer le profil superadmin
    const { error: profileErr } = await sb.from('gp_profiles').insert({
      user_id: authData.user.id,
      username,
      display_name: displayName,
      titre,
      is_superadmin: true,
      sections_edit: ['effectifs','commerces','codex','finances','impots'],
    });
    if (profileErr) throw new Error('Profil non créé : ' + profileErr.message);

    // 3. Connexion automatique
    if (!authData.session) {
      const { error: loginErr } = await sb.auth.signInWithPassword({
        email: `${username}@${CFG.authEmailDomain}`,
        password,
      });
      if (loginErr) throw new Error('Compte créé ! Mais la connexion a échoué : ' + loginErr.message + '. Essaie de te connecter manuellement.');
    }

    await loadSession();
    toast(`Bienvenue, ${session?.displayName || displayName} ! Le livret est prêt.`);
    await refreshAll();

  } catch (e) {
    err(e.message || 'Une erreur est survenue.');
    btn.disabled = false;
    btn.textContent = 'Créer le compte superadmin';
  }
}
