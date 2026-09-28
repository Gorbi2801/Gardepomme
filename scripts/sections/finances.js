// ══════════════════════════════════════════════════════════════════════
//  TRÉSOR
//  Vue par défaut : semaine courante (lundi–dimanche).
//  Clôture : génère un .txt + archive dans gp_semaines.
// ══════════════════════════════════════════════════════════════════════
const OP_CATEGORIES_MANUEL = ['Vente', 'Achat', 'Amende'];
const OP_CATEGORIES_TOUTES = ['Vente', 'Achat', 'Amende', 'Salaires', 'Impôts', 'Taxes'];

const OP_FIELDS = [
  { key: 'date_op', label: 'Date', type: 'date', required: true, default: today() },
  { key: 'categorie', label: 'Catégorie', type: 'select', options: OP_CATEGORIES_MANUEL },
  { key: 'montant', label: 'Montant (septims)', type: 'number', required: true },
  { key: 'libelle', label: 'Libellé', required: true, full: true },
  { key: 'details', label: 'Détails', type: 'textarea', rows: 2 },
];

// Déduit le sens depuis la catégorie
function sensFromCategorie(cat) {
  if (cat === 'Vente') return 'Recette';
  if (cat === 'Achat') return 'Dépense';
  return null; // Amende : déterminé par l'utilisateur via le libellé, on demande
}

function signed(o) { return o.sens === 'Recette' ? num(o.montant) : -num(o.montant); }
function soldeTresor() { return DB.operations.reduce((s, o) => s + signed(o), 0); }

let finPeriode = 'semaine';  // défaut : semaine courante
let finTab = 'registre';     // registre | archives

// ── Calcul de la semaine courante (lundi–dimanche) ──────────────────
function weekRange(date) {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay(); // 0=dim
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}
function isoWeek(d) {
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const y = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return `${utc.getUTCFullYear()}-W${String(Math.ceil(((utc - y) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
function fmtDateShort(d) {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
function currentWeekLabel() {
  const { monday, sunday } = weekRange();
  return `Semaine ${isoWeek(monday).split('-W')[1]} — ${fmtDateShort(monday)} au ${fmtDateShort(sunday)} ${sunday.getFullYear()}`;
}
function isSunday() { return new Date().getDay() === 0; }

function opsPeriode() {
  if (finPeriode === 'tout') return DB.operations;
  if (finPeriode === 'semaine') {
    const { monday, sunday } = weekRange();
    const from = monday.toISOString().slice(0, 10);
    const to   = sunday.toISOString().slice(0, 10);
    return DB.operations.filter(o => o.date_op >= from && o.date_op <= to);
  }
  const d = new Date();
  let from;
  if (finPeriode === '7j')  { d.setDate(d.getDate() - 7); from = d.toISOString().slice(0, 10); }
  else if (finPeriode === '30j') { d.setDate(d.getDate() - 30); from = d.toISOString().slice(0, 10); }
  else from = today().slice(0, 8) + '01';
  return DB.operations.filter(o => o.date_op >= from);
}

RENDERERS.finances = () => {
  const solde = soldeTresor();
  const ops   = opsPeriode();
  const rec7  = ops.filter(o => o.sens === 'Recette').reduce((s, o) => s + num(o.montant), 0);
  const dep7  = ops.filter(o => o.sens === 'Dépense').reduce((s, o) => s + num(o.montant), 0);

  const weekKey = isoWeek(weekRange().monday);
  const dejaClose = DB.semaines?.some(s => s.semaine === weekKey);

  const tabs = [['registre', 'Registre'], ['archives', 'Archives hebdomadaires']];

  return `${sectionHead('Trésor de la baronnie', 'Les recettes et dépenses. Vue par défaut : semaine courante (lundi–dimanche).')}
  <div class="summary-strip">
    <div class="ruled"><span>Solde cumulé</span><strong class="${solde < 0 ? 'out' : ''}">${septims(solde)}</strong></div>
    <div><span>Recettes (période)</span><strong class="in">${septims(rec7)}</strong></div>
    <div><span>Dépenses (période)</span><strong class="out">${septims(dep7)}</strong></div>
    <div><span>Résultat (période)</span><strong class="${rec7-dep7 >= 0 ? 'in' : 'out'}">${septimsSigned(rec7 - dep7)}</strong></div>
  </div>
  <div class="tabs" role="tablist">
    ${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === finTab}" class="tab${k === finTab ? ' active' : ''}" onclick="finSetTab('${k}')">${esc(l)}</button>`).join('')}
  </div>
  ${finTab === 'archives' ? renderArchives() : renderRegistre(dejaClose)}`;
};

function renderRegistre(dejaClose) {
  const edit = canEdit('finances');
  const ops  = opsPeriode();
  const rec  = ops.filter(o => o.sens === 'Recette').reduce((s, o) => s + num(o.montant), 0);
  const dep  = ops.filter(o => o.sens === 'Dépense').reduce((s, o) => s + num(o.montant), 0);

  const periodes = [
    ['semaine', 'Semaine courante'],
    ['tout', 'Depuis le début'],
    ['7j', '7 derniers jours'],
    ['30j', '30 derniers jours'],
    ['mois', 'Ce mois-ci'],
  ];
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
      <td><strong>${esc(o.libelle)}</strong>${o.details ? `<span class="note-inline">${esc(o.details)}</span>` : ''}</td>
      <td><span class="pill">${esc(o.categorie)}</span></td>
      <td class="muted-text">${esc(o.auteur || '—')}</td>
      <td class="num in">${o.sens === 'Recette' ? septims(o.montant) : ''}</td>
      <td class="num out">${o.sens === 'Dépense' ? septims(o.montant) : ''}</td>
      ${rowActions('finances', `editOp('${o.id}')`, `delOp('${o.id}')`)}
    </tr>`).join('');

  const clotureBtn = edit && finPeriode === 'semaine'
    ? dejaClose
      ? `<button class="btn btn-ghost" onclick="cloturerSemaine(true)">Re-générer le .txt</button>`
      : `<button class="btn btn-primary" title="${isSunday() ? '' : 'Disponible à tout moment, recommandé le dimanche'}" onclick="cloturerSemaine(false)">Clôturer la semaine</button>`
    : '';

  const weekLabel = finPeriode === 'semaine' ? `<p class="muted-text" style="margin-bottom:.6rem;font-size:.9rem">${currentWeekLabel()}</p>` : '';

  return `<div class="sheet">
    ${weekLabel}
    ${toolbar({ section: 'finances', searchId: 'op-q', onSearch: 'filterOps()', filters,
      addLabel: 'Inscrire une opération', onAdd: 'editOp()',
      extra: `<button class="btn btn-ghost" onclick="exportCsv('op-table','tresor_gardepomme.csv')">Exporter</button>${clotureBtn}` })}
    <div class="table-wrap"><table id="op-table" class="ledger">
      <thead><tr>
        ${th('Date')}${th('Libellé')}${th('Catégorie')}${th('Saisi par')}
        ${th('Recette','num')}${th('Dépense','num')}
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
    </table></div>
  </div>
  ${sectionHistory(['gp_operations'])}`;
}

function renderArchives() {
  const sem = (DB.semaines || []).slice().sort((a, b) => b.semaine.localeCompare(a.semaine));
  const rows = sem.map(s => `
    <tr>
      <td><strong>${esc(s.label)}</strong></td>
      <td class="num in">${septims(s.recettes)}</td>
      <td class="num out">${septims(s.depenses)}</td>
      <td class="num ${num(s.resultat) >= 0 ? 'in' : 'out'}">${septimsSigned(s.resultat)}</td>
      <td class="num">${septims(s.solde_fin)}</td>
      <td class="muted-text">${fmtDate(s.closed_at)}</td>
      <td class="actions">
        <button class="btn btn-small btn-ghost" onclick="dlArchive('${s.id}')">Télécharger .txt</button>
      </td>
    </tr>`).join('');

  return `<div class="sheet">
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Semaine</th>${th('Recettes','num')}${th('Dépenses','num')}${th('Résultat','num')}${th('Solde final','num')}<th>Clôturée le</th><th class="actions">Fichier</th></tr></thead>
      <tbody>${rows || emptyRow(7, 'Aucune semaine clôturée pour le moment.')}</tbody>
    </table></div>
  </div>`;
}

// ── Clôture ──────────────────────────────────────────────────────────
function genTxt(ops, solde, label, dateDebut, dateFin) {
  const sep  = '═'.repeat(50);
  const line = '─'.repeat(50);
  const pad  = (s, n) => String(s).padEnd(n);
  const padR = (s, n) => String(s).padStart(n);

  const recOps = ops.filter(o => o.sens === 'Recette');
  const depOps = ops.filter(o => o.sens === 'Dépense');
  const rec = recOps.reduce((s, o) => s + num(o.montant), 0);
  const dep = depOps.reduce((s, o) => s + num(o.montant), 0);

  const ligneOp = o =>
    `  ${pad(o.libelle.slice(0, 34), 35)} ${padR(num(o.montant).toLocaleString('fr-FR') + ' sept.', 13)}`;

  let txt = `${sep}\n`;
  txt += `  BARONNIE DE GARDEPOMME\n`;
  txt += `  ${label}\n`;
  txt += `  Du ${fmtDate(dateDebut)} au ${fmtDate(dateFin)}\n`;
  txt += `${sep}\n\n`;

  txt += `RECETTES\n${line}\n`;
  txt += recOps.length ? recOps.map(ligneOp).join('\n') + '\n' : '  Aucune recette.\n';
  txt += `${line}\n  ${pad('TOTAL RECETTES', 35)} ${padR(rec.toLocaleString('fr-FR') + ' sept.', 13)}\n\n`;

  txt += `DÉPENSES\n${line}\n`;
  txt += depOps.length ? depOps.map(ligneOp).join('\n') + '\n' : '  Aucune dépense.\n';
  txt += `${line}\n  ${pad('TOTAL DÉPENSES', 35)} ${padR(dep.toLocaleString('fr-FR') + ' sept.', 13)}\n\n`;

  txt += `${sep}\n`;
  const res = rec - dep;
  txt += `  RÉSULTAT DE LA SEMAINE : ${(res >= 0 ? '+' : '') + res.toLocaleString('fr-FR')} sept.\n`;
  txt += `  SOLDE DU TRÉSOR (fin)  : ${solde.toLocaleString('fr-FR')} sept.\n`;
  txt += `${sep}\n`;
  return { txt, rec, dep, res };
}

function dlTxt(txt, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
  a.download = filename;
  a.click();
}

async function cloturerSemaine(regenOnly) {
  if (!canEdit('finances')) return;
  const { monday, sunday } = weekRange();
  const from = monday.toISOString().slice(0, 10);
  const to   = sunday.toISOString().slice(0, 10);
  const ops  = DB.operations.filter(o => o.date_op >= from && o.date_op <= to);
  const solde = soldeTresor();
  const weekKey = isoWeek(monday);
  const label = currentWeekLabel();

  if (!regenOnly && !await confirmBox(
    `Clôturer ${label} ?\n\nUn fichier .txt sera généré et le récapitulatif sauvegardé dans les archives. Les données du trésor ne sont pas supprimées — la vue "Semaine courante" affichera la nouvelle semaine dès lundi.`,
    'Clôturer la semaine'
  )) return;

  const { txt, rec, dep, res } = genTxt(ops, solde, label, from, to);
  const filename = `tresor_gardepomme_${weekKey}.txt`;
  dlTxt(txt, filename);

  if (!regenOnly) {
    const existing = DB.semaines?.find(s => s.semaine === weekKey);
    const row = { semaine: weekKey, label, date_debut: from, date_fin: to,
      recettes: rec, depenses: dep, resultat: res, solde_fin: solde,
      contenu_txt: txt, closed_at: new Date().toISOString() };
    if (existing) await apiUpdate('gp_semaines', existing.id, row);
    else await apiInsert('gp_semaines', row);
    toast(`Semaine clôturée — ${filename} téléchargé.`);
    await reload();
  } else {
    toast(`${filename} régénéré et téléchargé.`);
  }
}

function dlArchive(id) {
  const s = DB.semaines?.find(x => x.id === id);
  if (!s) return;
  dlTxt(s.contenu_txt, `tresor_gardepomme_${s.semaine}.txt`);
}

// ── Actions ──────────────────────────────────────────────────────────
function finSetTab(k) { finTab = k; renderActive(); }
function finSetPeriode(p) { finPeriode = p; renderActive(); }
function filterOps() {
  filterTable('op-tbody', 'op-q', {
    sens: document.getElementById('op-sens')?.value || '',
    cat:  document.getElementById('op-cat')?.value  || '',
  });
}
function editOp(id) {
  const row = id ? DB.operations.find(o => o.id === id) : null;
  openEditor({
    table: 'gp_operations', section: 'finances', title: 'opération', fields: OP_FIELDS, row,
    transform: d => {
      const cat = d.categorie;
      let sens = sensFromCategorie(cat);
      if (!sens) {
        // Amende : on demande le sens via un champ caché qu'on ajoute dynamiquement
        const el = document.getElementById('f-amende-sens');
        sens = el ? el.value : 'Recette';
      }
      return { ...d, sens, auteur: currentAuthor() };
    },
    after: reload,
    onBodyReady: () => injectAmendeSens(row?.sens),
  });
}

function injectAmendeSens(currentSens) {
  const catEl = document.getElementById('f-categorie');
  if (!catEl) return;
  catEl.addEventListener('change', () => toggleAmendeSens(catEl.value));
  toggleAmendeSens(catEl.value, currentSens);
}

function toggleAmendeSens(cat, currentSens) {
  const existing = document.getElementById('amende-sens-wrap');
  if (cat !== 'Amende') { if (existing) existing.remove(); return; }
  if (existing) return;
  const wrap = document.createElement('div');
  wrap.id = 'amende-sens-wrap';
  wrap.className = 'field';
  wrap.innerHTML = `<label for="f-amende-sens">Sens de l'amende</label>
    <select id="f-amende-sens">
      <option value="Recette"${currentSens !== 'Dépense' ? ' selected' : ''}>Reçue (Recette)</option>
      <option value="Dépense"${currentSens === 'Dépense' ? ' selected' : ''}>Payée (Dépense)</option>
    </select>`;
  const grid = document.querySelector('#modal-body .form-grid');
  if (grid) grid.insertBefore(wrap, grid.children[1]);
}
function delOp(id) {
  const o = DB.operations.find(x => x.id === id);
  removeRow({ table: 'gp_operations', section: 'finances', id,
    label: `${o?.libelle} (${septims(o?.montant)})`, after: reload });
}
