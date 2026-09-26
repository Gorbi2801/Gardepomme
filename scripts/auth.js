// ══════════════════════════════════════════════════════════════════════
//  MODE INTENDANCE — mot de passe partagé, pas de comptes Supabase
//  Le mot de passe est stocké dans config.js (généré par GitHub Actions)
//  et jamais visible dans le repo.
// ══════════════════════════════════════════════════════════════════════

function openIntendance() {
  openModal({
    title: 'Mode intendance',
    body: `<p class="modal-text">Ce mode permet de modifier le livret.
      Réservé au baron et aux intendants.</p>
      <div class="form-grid">
        <div class="field full">
          <label for="int-name">Votre nom (pour l'historique)</label>
          <input id="int-name" placeholder="ex : Haldor Blancerf" autocomplete="name">
        </div>
        <div class="field full">
          <label for="int-pass">Mot de passe</label>
          <input id="int-pass" type="password" autocomplete="current-password">
        </div>
      </div>`,
    okLabel: 'Accéder au mode intendance',
    onOk: async () => {
      const name = document.getElementById('int-name').value.trim();
      const pass = document.getElementById('int-pass').value;
      if (!name) return modalError('Entrez votre nom.');
      if (!CFG.intendancePassword) return modalError('Mot de passe non configuré (secret GitHub manquant).');
      if (pass !== CFG.intendancePassword) return modalError('Mot de passe incorrect.');
      _editMode = true;
      _intendantName = name;
      try {
        sessionStorage.setItem('gp_intendant', JSON.stringify({ name, ts: Date.now() }));
      } catch (_) {}
      toast(`Mode intendance activé. Bienvenue, ${name}.`);
      renderSessionUI();
      await refreshAll();
    },
  });
}

function quitIntendance() {
  _editMode = false;
  _intendantName = '';
  try { sessionStorage.removeItem('gp_intendant'); } catch (_) {}
  renderSessionUI();
  refreshAll();
}

function loadSession() {
  try {
    const stored = sessionStorage.getItem('gp_intendant');
    if (stored) {
      const { name, ts } = JSON.parse(stored);
      if (name && Date.now() - ts < 8 * 3600 * 1000) {
        _editMode = true;
        _intendantName = name;
      } else {
        sessionStorage.removeItem('gp_intendant');
      }
    }
  } catch (_) {}
  renderSessionUI();
}

function renderSessionUI() {
  const box = document.getElementById('session-box');
  document.body.classList.toggle('is-logged', _editMode);
  if (!_editMode) {
    box.innerHTML = `<button class="btn btn-ghost" onclick="openIntendance()">
      Intendance</button>`;
  } else {
    box.innerHTML = `<div class="session-who">
        <strong>${esc(_intendantName)}</strong>
        <em>Mode intendance actif</em>
      </div>
      <button class="btn btn-ghost" onclick="quitIntendance()">Quitter</button>`;
  }
  renderNav();
}
