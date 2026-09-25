// ══════════════════════════════════════════════════════════════════════
//  TRÉSOR — registre des opérations, négoce, catalogue
// ══════════════════════════════════════════════════════════════════════
const OP_CATEGORIES = ['Négoce', 'Salaires', 'Impôts', 'Taxes commerciales', 'Récoltes', 'Travaux & entretien', 'Achats', 'Amendes', 'Dons & subsides', 'Solde initial', 'Autre'];
const OP_FIELDS = [
  { key: 'date_op', label: 'Date', type: 'date', required: true, default: today() },
  { key: 'sens', label: 'Sens', type: 'select', options: ['Recette', 'Dépense'] },
  { key: 'categorie', label: 'Catégorie', type: 'select', options: OP_CATEGORIES },
  { key: 'montant', label: 'Montant (septims)', type: 'number', required: true },
  { key: 'libelle', label: 'Libellé', required: true, full: true },
  { key: 'details', label: 'Détails', type: 'textarea', rows: 3 },
];
const CAT_FIELDS = [
  { key: 'nom', label: 'Article', required: true },
  { key: 'categorie', label: 'Catégorie', type: 'datalist', options: ['Récolte', 'Cidre & boissons', 'Nourriture', 'Bois', 'Minerai', 'Équipement', 'Bétail', 'Autre'] },
  { key: 'unite', label: 'Unité', default: 'unité', hint: 'unité, caisse, tonneau, stère…' },
  { key: 'prix_achat', label: "Prix d'achat (septims)", type: 'number', hint: 'Ce que la baronnie paie.' },
  { key: 'prix_vente', label: 'Prix de vente (septims)', type: 'number', hint: 'Ce que la baronnie encaisse.' },
];

let finTab = 'registre';
let finPeriode = 'tout';
let negoce = { sens: 'Recette', lignes: [] };

function signed(o) { return o.sens === 'Recette' ? num(o.montant) : -num(o.montant); }
function soldeTresor() { return DB.operations.reduce((s, o) => s + signed(o), 0); }
function opsPeriode() {
  if (finPeriode === 'tout') return DB.operations;
  const d = new Date();
  let from;
  if (finPeriode === '7j') { d.setDate(d.getDate() - 7); from = d.toISOString().slice(0, 10); }
  else if (finPeriode === '30j') { d.setDate(d.getDate() - 30); from = d.toISOString().slice(0, 10); }
  else from = today().slice(0, 8) + '01';
  return DB.operations.filter(o => o.date_op >= from);
}

RENDERERS.finances = () => {
  const edit = canEdit('finances');
  const tabs = [['registre', 'Registre des comptes'], ...(edit ? [['negoce', 'Nouveau négoce']] : []), ['catalogue', 'Catalogue des prix']];
  if (!tabs.some(t => t[0] === finTab)) finTab = 'registre';
  const solde = soldeTresor();
  const body = finTab === 'negoce' ? renderNegoce() : finTab === 'catalogue' ? renderCatalogue() : renderRegistre();
  return `${sectionHead('Trésor de la baronnie', 'Chaque recette et chaque dépense, dans l’ordre où elles ont été inscrites.')}
  <div class="treasury">
    <div class="treasury-balance ${solde < 0 ? 'neg' : ''}">
      <span>Solde du trésor</span>
      <strong>${septims(solde)}</strong>
    </div>
  </div>
  <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === finTab}" class="tab${k === finTab ? ' active' : ''}" onclick="finSetTab('${k}')">${esc(l)}</button>`).join('')}</div>
  ${body}
  ${sectionHistory(['gp_operations', 'gp_catalogue'])}`;
};

function renderRegistre() {
  const edit = canEdit('finances');
  const ops = opsPeriode();
  const rec = ops.filter(o => o.sens === 'Recette').reduce((s, o) => s + num(o.montant), 0);
  const dep = ops.filter(o => o.sens === 'Dépense').reduce((s, o) => s + num(o.montant), 0);
  const periodes = [['tout', 'Depuis le début'], ['7j', '7 derniers jours'], ['30j', '30 derniers jours'], ['mois', 'Ce mois-ci']];
  const filters = `
    <select id="op-per" onchange="finSetPeriode(this.value)" aria-label="Période">${periodes.map(([k, l]) => `<option value="${k}"${k === finPeriode ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <select id="op-sens" onchange="filterOps()" aria-label="Sens"><option value="">Recettes et dépenses</option><option>Recette</option><option>Dépense</option></select>
    <select id="op-cat" onchange="filterOps()" aria-label="Catégorie"><option value="">Toutes catégories</option>${OP_CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}</select>`;
  const rows = ops.map(o => `
    <tr data-s="${esc(norm([o.libelle, o.categorie, o.details, o.auteur].join(' ')))}" data-sens="${esc(o.sens)}" data-cat="${esc(o.categorie)}">
      <td data-sort="${esc(o.date_op)}">${fmtDate(o.date_op)}</td>
      <td><strong>${esc(o.libelle)}</strong>${o.details ? `<details class="members"><summary>Détails</summary><pre>${esc(o.details)}</pre></details>` : ''}</td>
      <td>${esc(o.categorie)}</td>
      <td class="muted-text">${esc(o.auteur || '—')}</td>
      <td class="num in" data-sort="${o.sens === 'Recette' ? num(o.montant) : ''}">${o.sens === 'Recette' ? septims(o.montant) : ''}</td>
      <td class="num out" data-sort="${o.sens === 'Dépense' ? num(o.montant) : ''}">${o.sens === 'Dépense' ? septims(o.montant) : ''}</td>
      ${rowActions('finances', `editOp('${o.id}')`, `delOp('${o.id}')`)}
    </tr>`).join('');
  return `<div class="sheet">
    ${toolbar({ section: 'finances', searchId: 'op-q', onSearch: 'filterOps()', filters, addLabel: 'Inscrire une opération', onAdd: 'editOp()',
      extra: `<button class="btn btn-ghost" onclick="exportCsv('op-table','tresor_gardepomme.csv')">Exporter</button>` })}
    <div class="table-wrap"><table id="op-table" class="ledger">
      <thead><tr>${th('Date')}${th('Libellé')}${th('Catégorie')}${th('Saisi par')}${th('Recette', 'num')}${th('Dépense', 'num')}${edit ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}</tr></thead>
      <tbody id="op-tbody">${rows || emptyRow(7, edit ? 'Aucune opération sur cette période. Commence par inscrire le solde initial du trésor.' : 'Aucune opération sur cette période.')}</tbody>
      <tfoot>
        <tr class="subtotal"><td colspan="4">Totaux de la période</td><td class="num in">${septims(rec)}</td><td class="num out">${septims(dep)}</td>${edit ? '<td></td>' : ''}</tr>
        <tr class="total"><td colspan="4">Résultat de la période</td><td class="num" colspan="2">${septimsSigned(rec - dep)}</td>${edit ? '<td></td>' : ''}</tr>
      </tfoot>
    </table></div>
  </div>`;
}

function renderNegoce() {
  const total = negoce.lignes.reduce((s, l) => s + num(l.qte) * num(l.prix), 0);
  const opts = DB.catalogue.map(c => `<option value="${c.id}">${esc(c.nom)} — achat ${septims(c.prix_achat)} / vente ${septims(c.prix_vente)}</option>`).join('');
  const lignes = negoce.lignes.map((l, i) => `
    <tr>
      <td><input value="${esc(l.nom)}" oninput="negSet(${i},'nom',this.value)" aria-label="Article"></td>
      <td class="num"><input type="number" min="0" step="1" value="${num(l.qte)}" oninput="negSet(${i},'qte',this.value)" aria-label="Quantité"></td>
      <td class="num"><input type="number" min="0" step="1" value="${num(l.prix)}" oninput="negSet(${i},'prix',this.value)" aria-label="Prix unitaire"></td>
      <td class="num" id="neg-l${i}">${septims(num(l.qte) * num(l.prix))}</td>
      <td class="actions"><button class="icon-btn danger" aria-label="Retirer la ligne" onclick="negDel(${i})">✕</button></td>
    </tr>`).join('');
  return `<div class="sheet negoce">
    <p class="lead-in">Compose le négoce ligne par ligne : le total se calcule seul et s'inscrit au trésor en une fois.</p>
    <div class="form-grid">
      <div class="field"><label for="neg-sens">La baronnie…</label>
        <select id="neg-sens" onchange="negSens(this.value)"><option value="Recette"${negoce.sens === 'Recette' ? ' selected' : ''}>vend (recette)</option><option value="Dépense"${negoce.sens === 'Dépense' ? ' selected' : ''}>achète (dépense)</option></select></div>
      <div class="field"><label for="neg-date">Date</label><input id="neg-date" type="date" value="${negoce.date || today()}" onchange="negoce.date=this.value"></div>
      <div class="field full"><label for="neg-lib">Avec qui / libellé</label><input id="neg-lib" value="${esc(negoce.libelle || '')}" oninput="negoce.libelle=this.value" placeholder="Ex : Vente de cidre à l'auberge de Bruma"></div>
    </div>
    <div class="neg-add">
      <select id="neg-item" aria-label="Article du catalogue"><option value="">Choisir un article du catalogue…</option>${opts}</select>
      <input id="neg-qte" type="number" min="1" step="1" value="1" aria-label="Quantité">
      <button class="btn btn-ghost" onclick="negAddCatalogue()">Ajouter</button>
      <button class="btn btn-ghost" onclick="negAddLibre()">Ligne libre</button>
    </div>
    <div class="table-wrap"><table class="ledger neg-table">
      <thead><tr><th>Article</th><th class="num">Quantité</th><th class="num">Prix unitaire</th><th class="num">Sous-total</th><th class="actions"><span class="sr-only">Retirer</span></th></tr></thead>
      <tbody>${lignes || emptyRow(5, 'Aucune ligne. Ajoute un article du catalogue ou une ligne libre.')}</tbody>
      <tfoot><tr class="total"><td colspan="3">Total du négoce (${negoce.sens === 'Recette' ? 'à encaisser' : 'à payer'})</td><td class="num" id="neg-total">${septims(total)}</td><td></td></tr></tfoot>
    </table></div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="negReset()">Vider</button>
      <button class="btn btn-primary" onclick="negSave()">Inscrire au trésor</button>
    </div>
  </div>`;
}

function renderCatalogue() {
  const edit = canEdit('finances');
  const rows = DB.catalogue.map(c => `
    <tr data-s="${esc(norm([c.nom, c.categorie].join(' ')))}">
      <td><strong>${esc(c.nom)}</strong></td><td>${esc(c.categorie || '—')}</td><td>${esc(c.unite || '—')}</td>
      <td class="num" data-sort="${num(c.prix_achat)}">${septims(c.prix_achat)}</td>
      <td class="num" data-sort="${num(c.prix_vente)}">${septims(c.prix_vente)}</td>
      ${rowActions('finances', `editCat('${c.id}')`, `delCat('${c.id}')`)}
    </tr>`).join('');
  return `<div class="sheet">
    ${toolbar({ section: 'finances', searchId: 'cat-q', onSearch: "filterTable('cat-tbody','cat-q')", addLabel: 'Ajouter un article', onAdd: 'editCat()' })}
    <div class="table-wrap"><table class="ledger">
      <thead><tr>${th('Article')}${th('Catégorie')}${th('Unité')}${th('Achat', 'num')}${th('Vente', 'num')}${edit ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}</tr></thead>
      <tbody id="cat-tbody">${rows || emptyRow(6, edit ? 'Le catalogue est vide. Ajoute les articles que la baronnie vend ou achète souvent.' : 'Le catalogue est vide.')}</tbody>
    </table></div>
  </div>`;
}

// ── Actions ─────────────────────────────────────────────────────────
function finSetTab(k) { finTab = k; renderActive(); }
function finSetPeriode(p) { finPeriode = p; renderActive(); }
function filterOps() { filterTable('op-tbody', 'op-q', { sens: document.getElementById('op-sens').value, cat: document.getElementById('op-cat').value }); }
function editOp(id) {
  const row = id ? DB.operations.find(o => o.id === id) : null;
  openEditor({ table: 'gp_operations', section: 'finances', title: 'opération', fields: OP_FIELDS, row, after: reload });
}
function delOp(id) {
  const o = DB.operations.find(x => x.id === id);
  removeRow({ table: 'gp_operations', section: 'finances', id, label: `${o?.libelle} (${septims(o?.montant)})`, after: reload });
}
function editCat(id) {
  const row = id ? DB.catalogue.find(c => c.id === id) : null;
  openEditor({ table: 'gp_catalogue', section: 'finances', title: 'article', fields: CAT_FIELDS, row, after: reload });
}
function delCat(id) {
  const c = DB.catalogue.find(x => x.id === id);
  removeRow({ table: 'gp_catalogue', section: 'finances', id, label: c?.nom, after: reload });
}

// ── Négoce ──────────────────────────────────────────────────────────
function negTotal() { return negoce.lignes.reduce((s, l) => s + num(l.qte) * num(l.prix), 0); }
function negSens(v) {
  negoce.sens = v;
  // Réajuste les prix issus du catalogue au bon tarif (achat / vente)
  negoce.lignes.forEach(l => {
    const c = l.itemId && DB.catalogue.find(x => x.id === l.itemId);
    if (c) l.prix = v === 'Recette' ? num(c.prix_vente) : num(c.prix_achat);
  });
  renderActive();
}
function negAddCatalogue() {
  const id = document.getElementById('neg-item').value;
  const c = DB.catalogue.find(x => x.id === id);
  if (!c) return toast("Choisis d'abord un article du catalogue.", 'err');
  const qte = Math.max(1, Math.round(num(document.getElementById('neg-qte').value)));
  const exist = negoce.lignes.find(l => l.itemId === id);
  if (exist) exist.qte = num(exist.qte) + qte;
  else negoce.lignes.push({ itemId: id, nom: c.nom, qte, prix: negoce.sens === 'Recette' ? num(c.prix_vente) : num(c.prix_achat) });
  renderActive();
}
function negAddLibre() { negoce.lignes.push({ itemId: null, nom: '', qte: 1, prix: 0 }); renderActive(); }
function negDel(i) { negoce.lignes.splice(i, 1); renderActive(); }
function negSet(i, k, v) {
  const l = negoce.lignes[i]; if (!l) return;
  l[k] = k === 'nom' ? v : Math.max(0, Math.round(num(v)));
  const cell = document.getElementById('neg-l' + i);
  if (cell) cell.textContent = septims(num(l.qte) * num(l.prix));
  document.getElementById('neg-total').textContent = septims(negTotal());
}
function negReset() { negoce = { sens: negoce.sens, lignes: [] }; renderActive(); }
async function negSave() {
  const lignes = negoce.lignes.filter(l => l.nom.trim() && num(l.qte) > 0);
  if (!lignes.length) return toast('Ajoute au moins une ligne avec un article et une quantité.', 'err');
  const total = negTotal();
  const libelle = (negoce.libelle || '').trim() || (negoce.sens === 'Recette' ? 'Vente' : 'Achat') + ' — négoce';
  const details = lignes.map(l => `${l.qte} × ${l.nom} à ${septims(l.prix)} = ${septims(num(l.qte) * num(l.prix))}`).join('\n');
  if (!await confirmBox(`Inscrire ${negoce.sens === 'Recette' ? 'une recette' : 'une dépense'} de ${septims(total)} au trésor ?`, 'Inscrire au trésor')) return;
  try {
    await apiInsert('gp_operations', { date_op: negoce.date || today(), sens: negoce.sens, categorie: 'Négoce', libelle, montant: total, details });
    toast(`Négoce de ${septims(total)} inscrit au trésor.`);
    negoce = { sens: negoce.sens, lignes: [] };
    finTab = 'registre';
    await reload();
  } catch (e) { toast(errMsg(e), 'err'); }
}
