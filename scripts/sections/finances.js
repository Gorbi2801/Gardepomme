// ══════════════════════════════════════════════════════════════════════
//  TRÉSOR — registre fiscal simplifié
//  Catégories manuelles : Vente, Achat, Amende
//  Catégories automatiques : Salaires (paie), Impôts, Taxes (commerces)
// ══════════════════════════════════════════════════════════════════════
const OP_CATEGORIES_MANUEL = ['Vente', 'Achat', 'Amende'];
const OP_CATEGORIES_TOUTES = ['Vente', 'Achat', 'Amende', 'Salaires', 'Impôts', 'Taxes'];

const OP_FIELDS = [
  { key: 'date_op', label: 'Date', type: 'date', required: true, default: today() },
  { key: 'sens', label: 'Sens', type: 'select', options: ['Recette', 'Dépense'] },
  { key: 'categorie', label: 'Catégorie', type: 'select', options: OP_CATEGORIES_MANUEL },
  { key: 'montant', label: 'Montant (septims)', type: 'number', required: true },
  { key: 'libelle', label: 'Libellé', required: true, full: true },
  { key: 'details', label: 'Détails', type: 'textarea', rows: 2 },
];

function signed(o) { return o.sens === 'Recette' ? num(o.montant) : -num(o.montant); }
function soldeTresor() { return DB.operations.reduce((s, o) => s + signed(o), 0); }

let finPeriode = 'tout';

RENDERERS.finances = () => {
  const edit = canEdit('finances');
  const solde = soldeTresor();
  const d7 = new Date(); d7.setDate(d7.getDate() - 7);
  const from7 = d7.toISOString().slice(0, 10);
  const rec7 = DB.operations.filter(o => o.sens === 'Recette' && o.date_op >= from7).reduce((s, o) => s + num(o.montant), 0);
  const dep7 = DB.operations.filter(o => o.sens === 'Dépense' && o.date_op >= from7).reduce((s, o) => s + num(o.montant), 0);

  return `${sectionHead('Trésor de la baronnie', 'Toutes les recettes et dépenses de la baronnie.')}
  <div class="summary-strip">
    <div class="ruled"><span>Solde actuel</span><strong>${septims(solde)}</strong></div>
    <div><span>Recettes (7 jours)</span><strong class="${rec7 > 0 ? 'in' : ''}">${septims(rec7)}</strong></div>
    <div><span>Dépenses (7 jours)</span><strong class="${dep7 > 0 ? 'out' : ''}">${septims(dep7)}</strong></div>
    <div><span>Résultat (7 jours)</span><strong class="${rec7-dep7 >= 0 ? 'in' : 'out'}">${septimsSigned(rec7 - dep7)}</strong></div>
  </div>
  <div class="sheet">
    ${renderRegistre()}
  </div>
  ${sectionHistory(['gp_operations'])}`;
};

function renderRegistre() {
  const edit = canEdit('finances');
  const ops = opsPeriode();
  const rec = ops.filter(o => o.sens === 'Recette').reduce((s, o) => s + num(o.montant), 0);
  const dep = ops.filter(o => o.sens === 'Dépense').reduce((s, o) => s + num(o.montant), 0);

  const periodes = [['tout', 'Depuis le début'], ['7j', '7 derniers jours'], ['30j', '30 derniers jours'], ['mois', 'Ce mois-ci']];
  const filters = `
    <select id="op-per" onchange="finSetPeriode(this.value)" aria-label="Période">
      ${periodes.map(([k, l]) => `<option value="${k}"${k === finPeriode ? ' selected' : ''}>${l}</option>`).join('')}
    </select>
    <select id="op-sens" onchange="filterOps()" aria-label="Sens">
      <option value="">Recettes et dépenses</option><option>Recette</option><option>Dépense</option>
    </select>
    <select id="op-cat" onchange="filterOps()" aria-label="Catégorie">
      <option value="">Toutes catégories</option>
      ${OP_CATEGORIES_TOUTES.map(c => `<option>${esc(c)}</option>`).join('')}
    </select>`;

  const rows = ops.map(o => `
    <tr data-s="${esc(norm([o.libelle, o.categorie, o.details, o.auteur].join(' ')))}"
        data-sens="${esc(o.sens)}" data-cat="${esc(o.categorie)}">
      <td data-sort="${esc(o.date_op)}">${fmtDate(o.date_op)}</td>
      <td><strong>${esc(o.libelle)}</strong>
        ${o.details ? `<span class="note-inline">${esc(o.details)}</span>` : ''}</td>
      <td><span class="pill">${esc(o.categorie)}</span></td>
      <td class="muted-text">${esc(o.auteur || '—')}</td>
      <td class="num in" data-sort="${o.sens === 'Recette' ? num(o.montant) : ''}">${o.sens === 'Recette' ? septims(o.montant) : ''}</td>
      <td class="num out" data-sort="${o.sens === 'Dépense' ? num(o.montant) : ''}">${o.sens === 'Dépense' ? septims(o.montant) : ''}</td>
      ${rowActions('finances', `editOp('${o.id}')`, `delOp('${o.id}')`)}
    </tr>`).join('');

  return `${toolbar({
    section: 'finances', searchId: 'op-q', onSearch: 'filterOps()', filters,
    addLabel: 'Inscrire une opération', onAdd: 'editOp()',
    extra: `<button class="btn btn-ghost" onclick="exportCsv('op-table','tresor_gardepomme.csv')">Exporter</button>`
  })}
  <div class="table-wrap"><table id="op-table" class="ledger">
    <thead><tr>
      ${th('Date')}${th('Libellé')}${th('Catégorie')}${th('Saisi par')}
      ${th('Recette', 'num')}${th('Dépense', 'num')}
      ${canEdit('finances') ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}
    </tr></thead>
    <tbody id="op-tbody">${rows || emptyRow(7, 'Aucune opération sur cette période.')}</tbody>
    <tfoot>
      <tr class="subtotal"><td colspan="4">Totaux de la période</td>
        <td class="num in">${septims(rec)}</td><td class="num out">${septims(dep)}</td>
        ${canEdit('finances') ? '<td></td>' : ''}
      </tr>
      <tr class="total"><td colspan="4">Résultat</td>
        <td class="num${rec-dep < 0 ? ' out' : ' in'}" colspan="2">${septimsSigned(rec - dep)}</td>
        ${canEdit('finances') ? '<td></td>' : ''}
      </tr>
    </tfoot>
  </table></div>`;
}

function opsPeriode() {
  if (finPeriode === 'tout') return DB.operations;
  const d = new Date();
  let from;
  if (finPeriode === '7j')  { d.setDate(d.getDate() - 7); from = d.toISOString().slice(0, 10); }
  else if (finPeriode === '30j') { d.setDate(d.getDate() - 30); from = d.toISOString().slice(0, 10); }
  else from = today().slice(0, 8) + '01';
  return DB.operations.filter(o => o.date_op >= from);
}

function finSetPeriode(p) { finPeriode = p; renderActive(); }
function filterOps() {
  filterTable('op-tbody', 'op-q', {
    sens: document.getElementById('op-sens').value,
    cat: document.getElementById('op-cat').value
  });
}

function editOp(id) {
  const row = id ? DB.operations.find(o => o.id === id) : null;
  openEditor({ table: 'gp_operations', section: 'finances', title: 'opération', fields: OP_FIELDS, row,
    transform: d => ({ ...d, auteur: currentAuthor() }),
    after: reload });
}
function delOp(id) {
  const o = DB.operations.find(x => x.id === id);
  removeRow({ table: 'gp_operations', section: 'finances', id,
    label: `${o?.libelle} (${septims(o?.montant)})`, after: reload });
}
