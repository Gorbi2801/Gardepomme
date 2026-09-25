// ══════════════════════════════════════════════════════════════════════
//  CONNEXION — identifiant + mot de passe (email technique masqué)
//  Même principe que le Grimoire : "baron" → baron@<authEmailDomain>
// ══════════════════════════════════════════════════════════════════════
const attempts = { count: 0, until: 0 };
function failAttempt() {
  attempts.count++;
  if (attempts.count >= 10) attempts.until = Date.now() + 30 * 60000;
  else if (attempts.count >= 7) attempts.until = Date.now() + 10 * 60000;
  else if (attempts.count >= 5) attempts.until = Date.now() + 2 * 60000;
  else if (attempts.count >= 3) attempts.until = Date.now() + 15000;
}

function openLogin() {
  openModal({
    title: 'Connexion au livret',
    body: `<p class="modal-text">Réservé au baron et aux intendants. Le livret reste lisible sans compte.</p>
      <div class="form-grid">
        <div class="field full"><label for="login-user">Identifiant</label><input id="login-user" autocomplete="username" autocapitalize="off"></div>
        <div class="field full"><label for="login-pass">Mot de passe</label><input id="login-pass" type="password" autocomplete="current-password"></div>
      </div>`,
    okLabel: 'Se connecter',
    onOk: doLogin,
  });
}

async function doLogin() {
  const username = document.getElementById('login-user').value.trim().toLowerCase();
  const password = document.getElementById('login-pass').value;
  if (!username || !password) return modalError('Renseigne ton identifiant et ton mot de passe.');
  if (!/^[a-z0-9_-]{3,32}$/.test(username)) return modalError('Identifiant invalide.');
  if (attempts.until > Date.now()) {
    return modalError(`Trop de tentatives. Réessaie dans ${Math.ceil((attempts.until - Date.now()) / 1000)} s.`);
  }
  const { error } = await sb.auth.signInWithPassword({ email: `${username}@${CFG.authEmailDomain}`, password });
  if (error) { failAttempt(); return modalError('Identifiant ou mot de passe incorrect.'); }
  attempts.count = 0; attempts.until = 0;
  await loadSession();
  if (!session) { await sb.auth.signOut(); return modalError("Ce compte n'a pas de profil dans le livret. Contacte le superadmin."); }
  toast(`Bienvenue, ${session.displayName}.`);
  await refreshAll();
}

async function doLogout() {
  await sb.auth.signOut();
  session = null;
  renderSessionUI();
  if (!canSee(activeSection)) activeSection = 'accueil';
  await refreshAll();
  toast('Déconnecté. Tu consultes le livret en lecture seule.');
}

async function loadSession() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { session = null; renderSessionUI(); return; }
  const { data: p, error } = await sb.from('gp_profiles')
    .select('username,display_name,titre,is_superadmin,sections_edit')
    .eq('user_id', user.id).maybeSingle();
  if (error || !p) { session = null; renderSessionUI(); return; }
  session = Object.freeze({
    user,
    username: p.username,
    displayName: p.display_name || p.username,
    titre: p.titre || '',
    isSuperadmin: p.is_superadmin === true,
    sectionsEdit: Array.isArray(p.sections_edit) ? p.sections_edit : [],
  });
  renderSessionUI();
}

function renderSessionUI() {
  const box = document.getElementById('session-box');
  document.body.classList.toggle('is-logged', isLogged());
  if (!isLogged()) {
    box.innerHTML = `<span class="session-mode">Lecture publique</span>
      <button class="btn btn-ghost" onclick="openLogin()">Se connecter</button>`;
  } else {
    box.innerHTML = `<span class="session-who"><strong>${esc(session.displayName)}</strong>${session.titre ? `<em>${esc(session.titre)}</em>` : ''}</span>
      <button class="btn btn-ghost" onclick="openPasswordChange()">Mot de passe</button>
      <button class="btn btn-ghost" onclick="doLogout()">Se déconnecter</button>`;
  }
  renderNav();
}

function openPasswordChange() {
  openModal({
    title: 'Changer mon mot de passe',
    body: `<div class="form-grid"><div class="field full"><label for="new-pass">Nouveau mot de passe</label>
      <input id="new-pass" type="password" autocomplete="new-password"><small>8 caractères minimum.</small></div></div>`,
    okLabel: 'Changer le mot de passe',
    onOk: async () => {
      const pw = document.getElementById('new-pass').value;
      if (pw.length < 8) return modalError('8 caractères minimum.');
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      toast('Mot de passe changé.');
    },
  });
}
