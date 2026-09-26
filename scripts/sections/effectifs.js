// ══════════════════════════════════════════════════════════════════════
//  EFFECTIFS & SALAIRES
//  Deux types : Employé (salaire fixe hebdo) et Prestataire (paiement
//  à la livraison, montant pré-rempli mais modifiable à chaque fois).
// ══════════════════════════════════════════════════════════════════════
const MEMBRE_CATEGORIES = ['Maison du Baron', 'Intendance', 'Garde', 'Employé', 'Prestataire'];
const MEMBRE_TYPES      = ['Employé', 'Prestataire'];
const MEMBRE_STATUTS    = ['Actif', 'Absent', 'Congédié'];
const RACES = ['Nordique', 'Impérial', 'Bréton', 'Rougegarde', 'Altmer', 'Bosmer', 'Dunmer', 'Orque', 'Khajiit', 'Argonien'];

const MEMBRE_FIELDS = [
  { key: 'prenom', label: 'Prénom', required: true },
  { key: 'nom', label: 'Nom' },
  { key: 'type_membre', label: 'Type', type: 'select', options: MEMBRE_TYPES,
    hint: 'Employé = salaire fixe hebdomadaire. Prestataire = payé à la livraison.' },
  { key: 'categorie', label: 'Catégorie', type: 'select', options: MEMBRE_CATEGORIES },
  { key: 'fonction', label: 'Fonction / activité', type: 'datalist',
    options: ['Baron', 'Intendant', 'Capitaine de la garde', 'Sergent', 'Garde', 'Recrue',
              'Scribe', 'Servant', 'Palefrenier', 'Cuisinier', 'Charbonnier', 'Mineur',
              'Bûcheron', 'Chasseur', 'Cueilleur'] },
  { key: 'race', label: 'Race', type: 'select', options: ['', ...RACES] },
  { key: 'salaire', label: 'Salaire / Prix par livraison (septims)', type: 'number',
    hint: 'Pour les prestataires : montant pré-rempli à chaque paiement, modifiable au moment du règlement.' },
  { key: 'statut', label: 'Statut', type: 'select', options: MEMBRE_STATUTS },
  { key: 'date_entree', label: "Date d'entrée", type: 'date' },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
];

function estEmploye(m)    { return (m.type_membre || 'Employé') === 'Employé'; }
function estPrestataire(m){ return m.type_membre === 'Prestataire'; }
function membresPayes()   { return DB.membres.filter(m => estEmploye(m) && m.statut === 'Actif' && num(m.salaire) > 0); }
function prestatairesActifs() { return DB.membres.filter(m => estPrestataire(m) && m.statut !== 'Congédié'); }
function masseSalariale() { return membresPayes().reduce((s, m) => s + num(m.salaire), 0); }
function masseRestante()  { return membresPayes().filter(m => !m.salaire_paye).reduce((s, m) => s + num(m.salaire), 0); }

RENDERERS.effectifs = () => {
  const edit = canEdit('effectifs');
  const actifs = DB.membres.filter(m => m.statut !== 'Congédié');
  const lastPaie = DB.operations.find(o => o.categorie === 'Salaires');

  const filtersHtml = `
    <select id="mem-type" onchange="filterMembres()" aria-label="Type">
      <option value="">Tous types</option>${MEMBRE_TYPES.map(t => `<option>${esc(t)}</option>`).join('')}
    </select>
    <select id="mem-cat" onchange="filterMembres()" aria-label="Catégorie">
      <option value="">Toutes catégories</option>${MEMBRE_CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}
    </select>
    <select id="mem-stat" onchange="filterMembres()" aria-label="Statut">
      <option value="">Tous statuts</option>${MEMBRE_STATUTS.map(s => `<option>${esc(s)}</option>`).join('')}
    </select>`;

  const rows = DB.membres.map(m => {
    const isP = estPrestataire(m);
    const salaireLabel = isP ? 'Prix/livraison' : 'Salaire';
    const paiementCell = isP
      ? (edit && m.statut !== 'Congédié'
          ? `<button class="btn btn-small btn-primary" onclick="payerPrestataire('${m.id}')">Payer</button>`
          : '<span class="muted-text">À la livraison</span>')
      : (num(m.salaire) > 0 && m.statut === 'Actif'
          ? `<input type="checkbox" class="salaire-check" aria-label="Salaire payé"
               ${m.salaire_paye ? 'checked' : ''}
               ${canEdit('effectifs') ? `onchange="togglePaiement('${m.id}', this.checked)"` : 'disabled'}>`
          : '<span class="muted-text">—</span>');

    return `<tr data-s="${esc(norm([fullName(m), m.fonction, m.categorie, m.race, m.notes].join(' ')))}"
                data-type="${esc(m.type_membre || 'Employé')}"
                data-cat="${esc(m.categorie)}"
                data-stat="${esc(m.statut)}"
                class="${m.statut === 'Congédié' ? 'muted' : ''}">
      <td><strong>${esc(fullName(m))}</strong>
          <span class="pill" style="font-size:.8rem;margin-left:.3rem">${isP ? 'Prestataire' : 'Employé'}</span>
          ${m.notes ? `<span class="note-inline">${esc(m.notes)}</span>` : ''}</td>
      <td>${esc(m.categorie)}</td>
      <td>${esc(m.fonction || '—')}</td>
      <td>${esc(m.race || '—')}</td>
      <td data-sort="${esc(m.date_entree || '')}">${fmtDate(m.date_entree)}</td>
      <td><span class="pill pill-${norm(m.statut)}">${esc(m.statut)}</span></td>
      <td class="num" data-sort="${num(m.salaire)}">${septims(m.salaire)}
          <span class="note-inline">${isP ? 'par livraison' : '/ sem.'}</span></td>
      <td class="center">${paiementCell}</td>
      ${rowActions('effectifs', `editMembre('${m.id}')`, `delMembre('${m.id}')`)}
    </tr>`;
  }).join('');

  return `${sectionHead('Effectifs', `Employés (salaire hebdomadaire) et prestataires (paiement à la livraison).`)}
  <div class="summary-strip">
    <div><span>Effectif en poste</span><strong>${actifs.filter(estEmploye).length}<small> employés</small></strong></div>
    <div><span>Prestataires actifs</span><strong>${prestatairesActifs().length}</strong></div>
    <div class="ruled"><span>Masse salariale / sem.</span><strong>${septims(masseSalariale())}</strong></div>
    <div><span>Reste à payer (employés)</span><strong>${septims(masseRestante())}</strong></div>
  </div>

  ${edit ? `<div class="callout">
    <p>Prochaine paie employés : <strong>${septims(masseRestante())}</strong> pour ${membresPayes().filter(m => !m.salaire_paye).length} personne(s).
    ${lastPaie ? `Dernière paie le ${fmtDate(lastPaie.date_op)}.` : ''}</p>
    <div class="callout-actions">
      <button class="btn btn-primary" onclick="verserPaie()">Verser la paie & marquer payés</button>
      <button class="btn btn-ghost" onclick="resetPaiements()">Nouvelle période</button>
    </div>
  </div>` : ''}

  <div class="sheet">
    ${toolbar({ section: 'effectifs', searchId: 'mem-q', onSearch: 'filterMembres()',
      filters: filtersHtml, addLabel: 'Ajouter', onAdd: 'editMembre()',
      extra: `<button class="btn btn-ghost" onclick="exportCsv('mem-table','effectifs_gardepomme.csv')">Exporter</button>` })}
    <div class="table-wrap"><table id="mem-table" class="ledger">
      <thead><tr>${th('Nom')}${th('Catégorie')}${th('Fonction')}${th('Race')}${th('Entrée')}${th('Statut')}${th('Montant','num')}
        <th class="center">Paie / Livraison</th>
        ${edit ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}
      </tr></thead>
      <tbody id="mem-tbody">${rows || emptyRow(9, edit ? 'Aucun membre inscrit.' : 'Aucun membre inscrit pour le moment.')}</tbody>
      <tfoot><tr class="total">
        <td colspan="6">Total salaires employés actifs</td>
        <td class="num">${septims(masseSalariale())}</td>
        <td></td>${edit ? '<td></td>' : ''}
      </tr></tfoot>
    </table></div>
  </div>
  ${sectionHistory(['gp_membres'])}`;
};

function filterMembres() {
  filterTable('mem-tbody', 'mem-q', {
    type: document.getElementById('mem-type').value,
    cat: document.getElementById('mem-cat').value,
    stat: document.getElementById('mem-stat').value,
  });
}

function editMembre(id) {
  const row = id ? DB.membres.find(m => m.id === id) : null;
  openEditor({ table: 'gp_membres', section: 'effectifs', title: 'membre', fields: MEMBRE_FIELDS, row, after: reload });
}
function delMembre(id) {
  const m = DB.membres.find(x => x.id === id);
  removeRow({ table: 'gp_membres', section: 'effectifs', id, label: fullName(m), after: reload });
}

// ── Prestataire : paiement à la livraison ───────────────────────────
function payerPrestataire(id) {
  const m = DB.membres.find(x => x.id === id);
  if (!m) return;
  const prix = num(m.salaire);
  openModal({
    title: `Payer ${fullName(m)}`,
    body: `<p class="modal-text">Prestataire — règlement pour une livraison ou une production.</p>
      <div class="form-grid">
        <div class="field"><label for="pp-date">Date</label><input id="pp-date" type="date" value="${today()}"></div>
        <div class="field"><label for="pp-montant">Montant (septims)</label>
          <input id="pp-montant" type="number" min="0" step="1" value="${prix}" inputmode="numeric"></div>
        <div class="field full"><label for="pp-lib">Libellé</label>
          <input id="pp-lib" value="Achat production — ${esc(fullName(m))}"></div>
        <div class="field full"><label for="pp-det">Détails (facultatif)</label>
          <textarea id="pp-det" rows="2" placeholder="Quantité, nature de la production…"></textarea></div>
      </div>`,
    okLabel: 'Enregistrer le paiement',
    onOk: async () => {
      const montant = Math.round(num(document.getElementById('pp-montant').value));
      if (!montant) return modalError('Montant invalide.');
      const libelle = document.getElementById('pp-lib').value.trim() || `Achat production — ${fullName(m)}`;
      const details = document.getElementById('pp-det').value.trim() || null;
      await apiInsert('gp_operations', {
        date_op: document.getElementById('pp-date').value || today(),
        sens: 'Dépense', categorie: 'Achat', auteur: currentAuthor(),
        libelle, montant, details,
      });
      toast(`${septims(montant)} versés à ${fullName(m)} — inscrit au trésor.`);
      await reload();
    },
  });
}

// ── Employés : paie hebdomadaire ─────────────────────────────────────
async function togglePaiement(id, paye) {
  try {
    await apiUpdate('gp_membres', id, { salaire_paye: paye });
    const m = DB.membres.find(x => x.id === id);
    if (m) m.salaire_paye = paye;
    renderActive();
  } catch (e) { toast(errMsg(e), 'err'); }
}

async function resetPaiements() {
  if (!await confirmBox('Remettre tous les salaires à "Non payé" pour une nouvelle période ?', 'Nouvelle période')) return;
  try {
    for (const m of DB.membres.filter(x => x.salaire_paye)) {
      await apiUpdate('gp_membres', m.id, { salaire_paye: false });
    }
    toast('Paiements réinitialisés.');
    await reload();
  } catch (e) { toast(errMsg(e), 'err'); }
}

function verserPaie() {
  const payes = membresPayes().filter(m => !m.salaire_paye);
  if (!payes.length) return toast('Tous les employés sont déjà marqués payés cette période.', 'err');
  const total = payes.reduce((s, m) => s + num(m.salaire), 0);
  const lignes = payes.map(m => `${fullName(m)} (${m.fonction || m.categorie}) : ${septims(m.salaire)}`);
  openModal({
    title: 'Verser la paie',
    wide: true,
    body: `<p class="modal-text">Une dépense « Salaires » de <strong>${septims(total)}</strong> sera inscrite au trésor.</p>
      <div class="form-grid">
        <div class="field"><label for="paie-date">Date</label><input id="paie-date" type="date" value="${today()}"></div>
        <div class="field"><label for="paie-lib">Libellé</label><input id="paie-lib" value="Paie des effectifs"></div>
      </div>
      <ul class="mini-list">${lignes.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`,
    okLabel: `Verser ${septims(total)}`,
    onOk: async () => {
      await apiInsert('gp_operations', {
        date_op: document.getElementById('paie-date').value || today(),
        sens: 'Dépense', categorie: 'Salaires', auteur: currentAuthor(),
        libelle: document.getElementById('paie-lib').value.trim() || 'Paie des effectifs',
        montant: total, details: lignes.join('\n'),
      });
      for (const m of payes) await apiUpdate('gp_membres', m.id, { salaire_paye: true });
      toast(`Paie de ${septims(total)} inscrite. Employés marqués payés.`);
      await reload();
    },
  });
}
