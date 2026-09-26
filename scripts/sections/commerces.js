// ══════════════════════════════════════════════════════════════════════
//  REGISTRE DES COMMERCES
// ══════════════════════════════════════════════════════════════════════
const SECTEURS_AGREMENT = ['Artisanat', 'Divertissement', 'Récolte', 'Terre (pâtres & paysans)'];
const COMMERCE_ACTIVITES = ['Verger & cidrerie', 'Ferme', 'Taverne', 'Forge', 'Marchand général', 'Alchimie', 'Scierie', 'Artisanat', 'Écurie', 'Autre'];
const COMMERCE_STATUTS = ['Ouvert', 'Suspendu', 'Fermé'];

const COMMERCE_FIELDS = [
  { key: 'nom', label: 'Nom du commerce', required: true },
  { key: 'activite', label: 'Activité', type: 'datalist', options: COMMERCE_ACTIVITES },
  { key: 'secteur', label: 'Secteur fiscal (Agrément)', type: 'select', options: SECTEURS_AGREMENT, hint: 'Détermine le forfait fixe de la Patente (Art. IV).' },
  { key: 'proprietaire', label: 'Propriétaire / gérant' },
  { key: 'emplacement', label: 'Emplacement' },
  { key: 'benefice', label: 'Bénéfice déclaré (septims)', type: 'number', hint: 'Par période, sert au calcul de la taxe.' },
  { key: 'statut', label: 'Statut', type: 'select', options: COMMERCE_STATUTS },
  { key: 'membres', label: 'Membres / employés', type: 'textarea', rows: 3, hint: 'Un nom par ligne.' },
  { key: 'exonere', label: 'Exonéré de taxe commerciale', type: 'checkbox', full: true },
  { key: 'notes', label: 'Activités & notes', type: 'textarea', rows: 3 },
];

function taxeDue(c) { return c.exonere || c.statut !== 'Ouvert' ? 0 : Math.round(num(c.benefice) * tauxTaxe() / 100); }
function derniereTaxe(c) { return DB.operations.find(o => o.commerce_id === c.id && o.categorie === 'Taxes commerciales'); }
function membresListe(c) { return String(c.membres || '').split('\n').map(s => s.trim()).filter(Boolean); }

RENDERERS.commerces = () => {
  const edit = canEdit('commerces');
  const ouverts = DB.commerces.filter(c => c.statut === 'Ouvert');
  const benef = ouverts.reduce((s, c) => s + num(c.benefice), 0);
  const taxes = DB.commerces.reduce((s, c) => s + taxeDue(c), 0);

  const filters = `
    <select id="com-act" onchange="filterCommerces()" aria-label="Filtrer par activité"><option value="">Toutes activités</option>${[...new Set(DB.commerces.map(c => c.activite).filter(Boolean))].sort().map(a => `<option>${esc(a)}</option>`).join('')}</select>
    <select id="com-stat" onchange="filterCommerces()" aria-label="Filtrer par statut"><option value="">Tous statuts</option>${COMMERCE_STATUTS.map(s => `<option>${esc(s)}</option>`).join('')}</select>`;

  const rows = DB.commerces.map(c => {
    const mem = membresListe(c);
    const last = derniereTaxe(c);
    return `<tr data-s="${esc(norm([c.nom, c.activite, c.proprietaire, c.emplacement, c.membres, c.notes].join(' ')))}" data-act="${esc(c.activite || '')}" data-stat="${esc(c.statut)}" class="${c.statut === 'Fermé' ? 'muted' : ''}">
      <td><strong>${esc(c.nom)}</strong>${c.notes ? `<span class="note-inline">${esc(c.notes)}</span>` : ''}</td>
      <td>${esc(c.activite || '—')}</td>
      <td>${esc(c.proprietaire || '—')}${c.emplacement ? `<span class="note-inline">${esc(c.emplacement)}</span>` : ''}</td>
      <td data-sort="${mem.length}">${mem.length ? `<details class="members"><summary>${mem.length} membre${mem.length > 1 ? 's' : ''}</summary><ul>${mem.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : '—'}</td>
      <td><span class="pill pill-${norm(c.statut)}">${esc(c.statut)}</span></td>
      <td class="num" data-sort="${num(c.benefice)}">${septims(c.benefice)}</td>
      <td class="num" data-sort="${taxeDue(c)}">${c.exonere ? '<span class="pill">Exonéré</span>' : (() => { const d = taxeDetail(c); return `${septims(d.total)}<span class="note-inline">Agrément ${septims(d.patente)} + Taille ${septims(d.taille)}</span>`; })()}${last ? `<span class="note-inline muted-text">perçue le ${fmtDate(last.date_op)}</span>` : ''}</td>
      ${rowActions('commerces', `editCommerce('${c.id}')`, `delCommerce('${c.id}')`)}
    </tr>`;
  }).join('');

  return `${sectionHead('Registre des commerces', `Commerces établis sur les terres de la baronnie. Taxe commerciale : <strong>${tauxTaxe()} %</strong> du bénéfice déclaré, par ${esc(periode())}.`)}
  <div class="summary-strip">
    <div><span>Commerces ouverts</span><strong>${ouverts.length}<small> / ${DB.commerces.length}</small></strong></div>
    <div><span>Bénéfices déclarés</span><strong>${septims(benef)}</strong></div>
    <div class="ruled"><span>Taxes à percevoir / ${esc(periode())}</span><strong>${septims(taxes)}</strong></div>
  </div>
  <div class="sheet">
    ${toolbar({ section: 'commerces', searchId: 'com-q', onSearch: 'filterCommerces()', filters, addLabel: 'Inscrire un commerce', onAdd: 'editCommerce()',
      extra: `<button class="btn btn-ghost" onclick="exportCsv('com-table','commerces_gardepomme.csv')">Exporter</button>` })}
    <div class="table-wrap"><table id="com-table" class="ledger">
      <thead><tr>${th('Commerce')}${th('Activité')}${th('Propriétaire')}${th('Membres')}${th('Statut')}${th('Bénéfice', 'num')}${th('Taxe due', 'num')}${edit ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}</tr></thead>
      <tbody id="com-tbody">${rows || emptyRow(8, edit ? 'Aucun commerce inscrit. Inscris le premier établissement de la baronnie.' : 'Aucun commerce inscrit pour le moment.')}</tbody>
      <tfoot><tr class="total"><td colspan="5">Totaux</td><td class="num">${septims(benef)}</td><td class="num">${septims(taxes)}</td>${edit ? '<td></td>' : ''}</tr></tfoot>
    </table></div>
  </div>
  ${sectionHistory(['gp_commerces'])}`;
};

function filterCommerces() {
  filterTable('com-tbody', 'com-q', { act: document.getElementById('com-act').value, stat: document.getElementById('com-stat').value });
}
function editCommerce(id) {
  const row = id ? DB.commerces.find(c => c.id === id) : null;
  openEditor({ table: 'gp_commerces', section: 'commerces', title: 'commerce', fields: COMMERCE_FIELDS, row, after: reload });
}
function delCommerce(id) {
  const c = DB.commerces.find(x => x.id === id);
  removeRow({ table: 'gp_commerces', section: 'commerces', id, label: c?.nom, after: reload });
}
