// ══════════════════════════════════════════════════════════════════════
//  DÉMARRAGE — chargé en dernier
// ══════════════════════════════════════════════════════════════════════
(async function init() {
  if (!window.GardepommeConfig?.supabaseUrl || !window.GardepommeConfig?.supabaseKey) {
    const page = document.getElementById('page');
    if (page) page.innerHTML = `
      <section class="sheet" role="alert" style="margin:2rem;padding:1.5rem">
        <h2>Configuration Supabase introuvable</h2>
        <p>Le fichier <code>scripts/config.js</code> est absent ou incomplet.</p>
        <p>Vérifie les secrets <code>SUPABASEURL</code> et <code>SUPABASEKEY</code>
        dans GitHub → Settings → Secrets and variables → Actions,
        puis relance le workflow de déploiement GitHub Pages.</p>
      </section>`;
    console.error('[Gardepomme] Configuration Supabase absente.');
    return;
  }
  if (!window.supabase?.createClient) {
    const page = document.getElementById('page');
    if (page) page.innerHTML = '<section class="sheet" role="alert" style="margin:2rem;padding:1.5rem"><h2>Bibliothèque Supabase indisponible</h2><p>Vérifie ta connexion ou le CDN jsDelivr.</p></section>';
    console.error('[Gardepomme] La bibliothèque Supabase (CDN) est indisponible.');
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

  // ── Vérification du premier démarrage ──────────────────────────────
  // Appelle l'Edge Function pour savoir si un superadmin existe déjà.
  // Pas de dépendance au cache PostgREST.
  try {
    const { count } = await sb
      .from('gp_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_superadmin', true);
    if (count === 0) { showFirstSetup(); return; }
  } catch (_) {}

  await loadSession();
  await refreshAll();
})();

// ── Écran de configuration initiale ───────────────────────────────────
function showFirstSetup() {
  // Masque la nav et le session-box tant qu'on n'a pas de compte
  document.getElementById('nav').innerHTML = '';
  document.getElementById('session-box').innerHTML = '';

  document.getElementById('page').innerHTML = `
    <div class="setup-wrap">
      <div class="setup-card">
        <img src="assets/blason.svg" alt="Blason de Gardepomme" width="64" height="74" style="display:block;margin:0 auto 1.2rem">
        <h2>Configuration initiale</h2>
        <p class="lead-in">Aucun compte n'existe encore. Crée le compte du baron — il aura accès à tout le livret et pourra créer d'autres comptes ensuite.</p>
        <div class="form-grid">
          <div class="field">
            <label for="su-user">Identifiant de connexion <span class="req" aria-hidden="true">*</span></label>
            <input id="su-user" autocomplete="username" autocapitalize="off" placeholder="ex : baron">
            <small>3 à 32 caractères : minuscules, chiffres, - ou _</small>
          </div>
          <div class="field">
            <label for="su-name">Nom affiché (nom du personnage) <span class="req" aria-hidden="true">*</span></label>
            <input id="su-name" placeholder="ex : Haldor Blancerf">
          </div>
          <div class="field full">
            <label for="su-titre">Titre</label>
            <input id="su-titre" placeholder="ex : Baron de Gardepomme" value="Baron de Gardepomme">
          </div>
          <div class="field">
            <label for="su-pass">Mot de passe <span class="req" aria-hidden="true">*</span></label>
            <input id="su-pass" type="password" autocomplete="new-password">
            <small>8 caractères minimum</small>
          </div>
          <div class="field">
            <label for="su-pass2">Confirmer le mot de passe <span class="req" aria-hidden="true">*</span></label>
            <input id="su-pass2" type="password" autocomplete="new-password">
          </div>
        </div>
        <p id="su-err" class="modal-err" role="alert" style="min-height:1.4rem"></p>
        <div style="display:flex;justify-content:flex-end;margin-top:1rem">
          <button class="btn btn-primary" id="su-btn" onclick="doFirstSetup()">Créer le compte superadmin</button>
        </div>
      </div>
    </div>`;
}

async function doFirstSetup() {
  const username = document.getElementById('su-user').value.trim().toLowerCase();
  const displayName = document.getElementById('su-name').value.trim();
  const titre = document.getElementById('su-titre').value.trim();
  const password = document.getElementById('su-pass').value;
  const password2 = document.getElementById('su-pass2').value;
  const err = msg => { document.getElementById('su-err').textContent = msg; };

  if (!username) return err('L\'identifiant est obligatoire.');
  if (!/^[a-z0-9_-]{3,32}$/.test(username)) return err('Identifiant invalide (3 à 32 car., minuscules/chiffres/- ou _).');
  if (!displayName) return err('Le nom affiché est obligatoire.');
  if (password.length < 8) return err('Mot de passe trop court (8 caractères minimum).');
  if (password !== password2) return err('Les deux mots de passe ne correspondent pas.');

  const btn = document.getElementById('su-btn');
  btn.disabled = true;
  btn.textContent = 'Création en cours…';
  err('');

  try {
    const { data, error } = await sb.functions.invoke('gp-admin-users', {
      body: { action: 'firstSetup', username, displayName, titre, password },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Erreur inconnue.');

    // Connexion automatique avec le compte qu'on vient de créer
    const { error: loginErr } = await sb.auth.signInWithPassword({
      email: `${username}@${CFG.authEmailDomain}`,
      password,
    });
    if (loginErr) throw new Error('Compte créé, mais la connexion automatique a échoué. Connecte-toi manuellement.');

    await loadSession();
    toast(`Bienvenue, ${session?.displayName || displayName} ! Le livret est prêt.`);
    await refreshAll();
  } catch (e) {
    err(e.message || 'Une erreur est survenue. Réessaie.');
    btn.disabled = false;
    btn.textContent = 'Créer le compte superadmin';
  }
}
