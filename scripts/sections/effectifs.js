// ══════════════════════════════════════════════════════════════════════
//  EFFECTIFS & SALAIRES
// ══════════════════════════════════════════════════════════════════════
const MEMBRE_CATEGORIES = ['Maison du Baron', 'Intendance', 'Garde', 'Employé'];
const MEMBRE_STATUTS = ['Actif', 'Absent', 'Congédié'];
const RACES = ['Nordique', 'Impérial', 'Bréton', 'Rougegarde', 'Altmer', 'Bosmer', 'Dunmer', 'Orque', 'Khajiit', 'Argonien'];

const MEMBRE_FIELDS = [
  { key: 'prenom', label: 'Prénom', required: true },
  { key: 'nom', label: 'Nom' },
  { key: 'categorie', label: 'Catégorie', type: 'select', options: MEMBRE_CATEGORIES },
  { key: 'fonction', label: 'Fonction / grade', type: 'datalist', options: ['Baron', 'Intendant', 'Capitaine de la garde', 'Sergent', 'Garde', 'Recrue', 'Scribe', 'Servant', 'Palefrenier', 'Cuisinier'] },
  { key: 'race', label: 'Race', type: 'select', options: ['', ...RACES] },
  { key: 'salaire', label: 'Salaire (septims)', type: 'number', hint: 'Versé à chaque paie.' },
  { key: 'statut', label: 'Statut', type: 'select', options: MEMBRE_STATUTS },
  { key: 'date_entree', label: "Date d'entrée", type: 'date' },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
  { key: 'salaire_paye', label: 'Salaire payé cette période', type: 'checkbox', full: true },
];

function membresPayes() { return DB.membres.filter(m => m.statut === 'Actif' && num(m.salaire) > 0); }
function masseSalariale() { return membresPayes().reduce((s, m) => s + num(m.salaire), 0); }
function masseRestante() { return membresPayes().filter(m => !m.salaire_paye).reduce((s, m) => s + num(m.salaire), 0); }

RENDERERS.effectifs = () => {
  const edit = canEdit('effectifs');
  const actifs = DB.membres.filter(m => m.statut !== 'Congédié');
  const parCat = MEMBRE_CATEGORIES.map(c => ({ c, n: actifs.filter(m => m.categorie === c).length }));
  const lastPaie = DB.operations.find(o => o.categorie === 'Salaires');

  const filters = `
    <select id="mem-cat" onchange="filterMembres()" aria-label="Filtrer par catégorie"><option value="">Toutes catégories</option>${MEMBRE_CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}</select>
    <select id="mem-stat" onchange="filterMembres()" aria-label="Filtrer par statut"><option value="">Tous statuts</option>${MEMBRE_STATUTS.map(c => `<option>${esc(c)}</option>`).join('')}</select>`;

  const rows = DB.membres.map(m => `
    <tr data-s="${esc(norm([fullName(m), m.fonction, m.categorie, m.race, m.notes].join(' ')))}" data-cat="${esc(m.categorie)}" data-stat="${esc(m.statut)}" class="${m.statut === 'Congédié' ? 'muted' : ''}">
      <td><strong>${esc(fullName(m))}</strong>${m.notes ? `<span class="note-inline">${esc(m.notes)}</span>` : ''}</td>
      <td>${esc(m.categorie)}</td>
      <td>${esc(m.fonction || '—')}</td>
      <td>${esc(m.race || '—')}</td>
      <td data-sort="${esc(m.date_entree || '')}">${fmtDate(m.date_entree)}</td>
      <td><span class="pill pill-${norm(m.statut)}">${esc(m.statut)}</span></td>
      <td class="num" data-sort="${num(m.salaire)}">${septims(m.salaire)}</td>
      <td class="center">${num(m.salaire) > 0 && m.statut === 'Actif'
        ? `<input type="checkbox" class="salaire-check" aria-label="Salaire payé"
             ${m.salaire_paye ? 'checked' : ''}
             ${canEdit('effectifs') ? `onchange="togglePaiement('${m.id}', this.checked)"` : 'disabled'}>`
        : '<span class="muted-text">—</span>'}</td>
      ${rowActions('effectifs', `editMembre('${m.id}')`, `delMembre('${m.id}')`)}
    </tr>`).join('');

  return `${sectionHead('Effectifs & salaires', `Les gardes, l'intendance et les gens de la maison. Paie versée par ${esc(periode())}.`)}
  <div class="summary-strip">
    <div><span>Effectif en poste</span><strong>${actifs.length}</strong></div>
    ${parCat.map(p => `<div><span>${esc(p.c)}</span><strong>${p.n}</strong></div>`).join('')}
    <div class="ruled"><span>Masse salariale / ${esc(periode())}</span><strong>${septims(masseSalariale())}</strong></div>
  </div>
  ${edit ? `<div class="callout">
      <p>Masse salariale totale : <strong>${septims(masseSalariale())}</strong> pour ${membresPayes().length} personne(s) en statut Actif.
      Reste à payer : <strong>${septims(masseRestante())}</strong>.</p>
      <div class="callout-actions">
        <button class="btn btn-primary" onclick="verserPaie()">Verser la paie & marquer tous payés</button>
        <button class="btn btn-ghost" onclick="resetPaiements()" title="Remet tous les salaires à Non payé pour une nouvelle période">Nouvelle période</button>
      </div>
    </div>` : ''}
  <div class="sheet">
    ${toolbar({ section: 'effectifs', searchId: 'mem-q', onSearch: 'filterMembres()', filters, addLabel: 'Ajouter une personne', onAdd: 'editMembre()',
      extra: `<button class="btn btn-ghost" onclick="exportCsv('mem-table','effectifs_gardepomme.csv')">Exporter</button>` })}
    <div class="table-wrap"><table id="mem-table" class="ledger">
      <thead><tr>${th('Nom')}${th('Catégorie')}${th('Fonction')}${th('Race')}${th('Entrée')}${th('Statut')}${th('Salaire', 'num')}<th class="center">Payé</th>${edit ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}</tr></thead>
      <tbody id="mem-tbody">${rows || emptyRow(9, edit ? "Personne n'est encore inscrit. Ajoute le premier membre de la baronnie." : 'Aucun membre inscrit pour le moment.')}</tbody>
      <tfoot><tr class="total"><td colspan="7">Total des salaires actifs</td><td class="num">${septims(masseSalariale())}</td>${edit ? '<td></td>' : ''}</tr></tfoot>
    </table></div>
  </div>
  ${sectionHistory(['gp_membres'])}`;
};

function filterMembres() {
  filterTable('mem-tbody', 'mem-q', { cat: document.getElementById('mem-cat').value, stat: document.getElementById('mem-stat').value });
}
function editMembre(id) {
  const row = id ? DB.membres.find(m => m.id === id) : null;
  openEditor({ table: 'gp_membres', section: 'effectifs', title: 'membre', fields: MEMBRE_FIELDS, row, after: reload });
}
function delMembre(id) {
  const m = DB.membres.find(x => x.id === id);
  removeRow({ table: 'gp_membres', section: 'effectifs', id, label: fullName(m), after: reload });
}

async function togglePaiement(id, paye) {
  try {
    await apiUpdate('gp_membres', id, { salaire_paye: paye });
    const m = DB.membres.find(x => x.id === id);
    if (m) m.salaire_paye = paye;
    // Rafraîchit juste le résumé sans recharger toute la page
    renderActive();
  } catch (e) { toast(errMsg(e), 'err'); }
}

async function resetPaiements() {
  if (!await confirmBox('Remettre tous les salaires à "Non payé" pour commencer une nouvelle période ?', 'Nouvelle période')) return;
  try {
    const ids = DB.membres.filter(m => m.salaire_paye).map(m => m.id);
    for (const id of ids) {
      await apiUpdate('gp_membres', id, { salaire_paye: false });
    }
    toast('Paiements réinitialisés pour la nouvelle période.');
    await reload();
  } catch (e) { toast(errMsg(e), 'err'); }
}

function verserPaie() {
  const payes = membresPayes();
  if (!payes.length) return toast("Personne n'a de salaire en statut Actif.", 'err');
  const total = masseSalariale();
  const lignes = payes.map(m => `${fullName(m)} (${m.fonction || m.categorie}) : ${septims(m.salaire)}`);
  openModal({
    title: 'Verser la paie',
    wide: true,
    body: `<p class="modal-text">Une dépense « Salaires » de <strong>${septims(total)}</strong> sera inscrite au trésor.</p>
      <div class="form-grid"><div class="field"><label for="paie-date">Date</label><input id="paie-date" type="date" value="${today()}"></div>
      <div class="field"><label for="paie-lib">Libellé</label><input id="paie-lib" value="Paie des effectifs"></div></div>
      <ul class="mini-list">${lignes.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`,
    okLabel: `Verser ${septims(total)}`,
    onOk: async () => {
      await apiInsert('gp_operations', {
        date_op: document.getElementById('paie-date').value || today(),
        sens: 'Dépense', categorie: 'Salaires', auteur: currentAuthor(),
        libelle: document.getElementById('paie-lib').value.trim() || 'Paie des effectifs',
        montant: total, details: lignes.join('\n'),
      });
      toast(`Paie de ${septims(total)} inscrite au trésor.`);
      await reload();
    },
  });
}
