// ══════════════════════════════════════════════════════════════════════
//  COMPTES — réservé au superadmin
//  Création / suppression / mot de passe : Edge Function gp-admin-users
//  Droits d'édition : mise à jour directe de gp_profiles (RLS superadmin)
// ══════════════════════════════════════════════════════════════════════
let comptesRows = [];

async function adminCall(action, payload) {
  const { data, error } = await sb.functions.invoke('gp-admin-users', { body: { action, ...payload } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json(); if (j?.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

RENDERERS.comptes = () => `${sectionHead('Comptes', 'Seuls les comptes créés ici peuvent modifier le livret. Chaque compte ne modifie que les sections cochées ; tout le monde peut lire.')}
  <div class="sheet">
    <div class="toolbar"><div class="toolbar-actions"><button class="btn btn-primary" onclick="editCompte()">Créer un compte</button></div></div>
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Nom affiché</th><th>Identifiant</th><th>Titre</th>${EDITABLE_SECTIONS.map(s => `<th class="center">${esc(SECTIONS[s].label.split(' ')[0])}</th>`).join('')}<th class="actions"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody id="comptes-body">${emptyRow(9, 'Chargement…')}</tbody>
    </table></div>
  </div>`;
RENDERERS['comptes:after'] = () => loadComptes();

async function loadComptes() {
  const tb = document.getElementById('comptes-body');
  try {
    comptesRows = await apiList('gp_profiles', 'display_name');
    tb.innerHTML = comptesRows.map(p => `<tr>
      <td><strong>${esc(p.display_name)}</strong>${p.is_superadmin ? ' <span class="pill pill-actif">Superadmin</span>' : ''}</td>
      <td><code>${esc(p.username)}</code></td>
      <td>${esc(p.titre || '—')}</td>
      ${EDITABLE_SECTIONS.map(s => `<td class="center">${p.is_superadmin || p.sections_edit?.includes(s) ? '<span class="tick" title="Peut modifier">✓</span>' : '<span class="muted-text" title="Lecture seule">—</span>'}</td>`).join('')}
      <td class="actions">
        <button class="icon-btn" title="Modifier les droits" aria-label="Modifier les droits" onclick="editCompte('${p.user_id}')">✎</button>
        <button class="icon-btn" title="Nouveau mot de passe" aria-label="Nouveau mot de passe" onclick="resetCompte('${p.user_id}')">⚿</button>
        ${p.user_id !== session.user.id ? `<button class="icon-btn danger" title="Supprimer le compte" aria-label="Supprimer le compte" onclick="delCompte('${p.user_id}')">✕</button>` : ''}
      </td></tr>`).join('') || emptyRow(9, 'Aucun compte.');
  } catch (e) { tb.innerHTML = emptyRow(9, errMsg(e)); }
}

function sectionsChecks(selected = []) {
  return `<fieldset class="field full checks"><legend>Sections qu'il peut modifier</legend>
    ${EDITABLE_SECTIONS.map(s => `<label><input type="checkbox" name="sec" value="${s}"${selected.includes(s) ? ' checked' : ''}> ${esc(SECTIONS[s].label)}</label>`).join('')}
  </fieldset>`;
}
function readChecks() { return [...document.querySelectorAll('input[name=sec]:checked')].map(i => i.value); }

function editCompte(uid) {
  const p = uid ? comptesRows.find(x => x.user_id === uid) : null;
  const base = [
    { key: 'display_name', label: 'Nom affiché (nom RP)', required: true },
    { key: 'titre', label: 'Titre', type: 'datalist', options: ['Baron', 'Baronne', 'Intendant', 'Intendante', 'Capitaine de la garde', 'Scribe', 'Trésorier'] },
  ];
  const creds = p ? [] : [
    { key: 'username', label: 'Identifiant de connexion', required: true, hint: '3 à 32 caractères : minuscules, chiffres, - ou _' },
    { key: 'password', label: 'Mot de passe provisoire', required: true, hint: '8 caractères minimum. À transmettre en privé.' },
  ];
  openModal({
    title: p ? `Droits de ${p.display_name}` : 'Créer un compte',
    wide: true,
    body: renderFields([...creds, ...base], p || {}) +
      `<div class="form-grid">${sectionsChecks(p?.sections_edit || [])}
       <div class="field full field-check"><label><input type="checkbox" id="f-super"${p?.is_superadmin ? ' checked' : ''}${p && p.user_id === session.user.id ? ' disabled' : ''}> Superadmin (tous les droits + gestion des comptes)</label></div></div>`,
    okLabel: p ? 'Enregistrer les droits' : 'Créer le compte',
    onOk: async () => {
      const v = readFields([...creds, ...base]);
      const sectionsEdit = readChecks();
      const isSuperadmin = document.getElementById('f-super').checked;
      if (p) {
        await apiUpdate('gp_profiles', p.user_id, { display_name: v.display_name, titre: v.titre, sections_edit: sectionsEdit, is_superadmin: isSuperadmin }, 'user_id');
        toast('Droits enregistrés.');
        if (p.user_id === session.user.id) await loadSession();
      } else {
        await adminCall('createAccount', { username: v.username, password: v.password, displayName: v.display_name, titre: v.titre, sectionsEdit, isSuperadmin });
        toast(`Compte « ${v.username} » créé.`);
      }
      loadComptes();
    },
  });
}

function resetCompte(uid) {
  const p = comptesRows.find(x => x.user_id === uid);
  openModal({
    title: `Nouveau mot de passe pour ${p.display_name}`,
    body: `<div class="form-grid"><div class="field full"><label for="rp-pass">Nouveau mot de passe</label><input id="rp-pass" type="text" autocomplete="off"><small>8 caractères minimum. À transmettre en privé.</small></div></div>`,
    okLabel: 'Changer le mot de passe',
    onOk: async () => {
      const pw = document.getElementById('rp-pass').value;
      if (pw.length < 8) return modalError('8 caractères minimum.');
      await adminCall('resetPassword', { userId: uid, password: pw });
      toast('Mot de passe changé.');
    },
  });
}

async function delCompte(uid) {
  const p = comptesRows.find(x => x.user_id === uid);
  if (!await confirmBox(`Supprimer le compte de ${p.display_name} ? Ses modifications restent dans l'historique.`, 'Supprimer le compte')) return;
  try { await adminCall('deleteAccount', { userId: uid }); toast('Compte supprimé.'); loadComptes(); }
  catch (e) { toast(errMsg(e), 'err'); }
}
