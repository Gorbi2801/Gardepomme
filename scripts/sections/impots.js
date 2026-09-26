// ══════════════════════════════════════════════════════════════════════
//  IMPÔTS — Agrément (patente fixe) + Taille (progressive sur bénéfice)
//  Conforme aux Lois Fiscales du Comté de Bruma, Art. IV et V
// ══════════════════════════════════════════════════════════════════════

// Agrément (patente hebdomadaire fixe par secteur)
const AGREMENT = {
  'Terre (pâtres & paysans)': 0,
  'Récolte':                  200,
  'Divertissement':            220,
  'Artisanat':                 220,
};

function patenteAmount(secteur) {
  return AGREMENT[secteur] ?? 220;
}

// Taille progressive sur bénéfice (Art. V)
function calculerTaille(benefice) {
  if (benefice <= 0) return 0;
  const tranches = [[500, 0], [1000, 0.10], [1000, 0.15], [1500, 0.25], [Infinity, 0.35]];
  let reste = benefice, impot = 0;
  for (const [plafond, taux] of tranches) {
    if (reste <= 0) break;
    const part = Math.min(reste, plafond);
    impot += Math.round(part * taux);
    reste -= part;
  }
  return impot;
}

function taxeDue(c) {
  if (c.exonere || c.statut !== 'Ouvert') return 0;
  return patenteAmount(c.secteur) + calculerTaille(num(c.benefice));
}
function taxeDetail(c) {
  const p = patenteAmount(c.secteur);
  const t = calculerTaille(num(c.benefice));
  return { patente: p, taille: t, total: p + t };
}
function derniereTaxe(c) {
  return DB.operations.find(o => o.commerce_id === c.id && o.categorie === 'Taxes');
}

const IMPOT_FIELDS = [
  { key: 'libelle', label: 'Impôt', required: true, hint: 'Ex : Cens de Sujétion, loyer, amende…' },
  { key: 'beneficiaire', label: 'À verser à', default: 'Comté de Bruma' },
  { key: 'montant', label: 'Montant (septims)', type: 'number', required: true },
  { key: 'echeance', label: 'Échéance', type: 'date' },
  { key: 'periode', label: 'Période concernée', hint: 'Ex : semaine 12, Sundas 4E 226' },
  { key: 'notes', label: 'Référence légale & notes', type: 'textarea', rows: 3 },
];

function impotEnRetard(i) { return i.statut !== 'Payé' && i.echeance && i.echeance < today(); }
function impotsAPayer()   { return DB.impots.filter(i => i.statut !== 'Payé'); }

RENDERERS.impots = () => {
  const edit = canEdit('impots');
  const dus = impotsAPayer();
  const totalDu = dus.reduce((s, i) => s + num(i.montant), 0);
  const retard  = dus.filter(impotEnRetard);
  const next    = dus.filter(i => i.echeance).sort((a, b) => a.echeance.localeCompare(b.echeance))[0];
  const taxables = DB.commerces.filter(c => taxeDue(c) > 0);
  const totalTaxes = taxables.reduce((s, c) => s + taxeDue(c), 0);

  const impRows = [...DB.impots]
    .sort((a, b) => (a.statut === 'Payé') - (b.statut === 'Payé') ||
      String(a.echeance || '9').localeCompare(String(b.echeance || '9')))
    .map(i => {
      const late = impotEnRetard(i);
      const st = i.statut === 'Payé'
        ? `<span class="pill pill-paye">Payé le ${fmtDate(i.paye_le)}</span>`
        : late ? '<span class="pill pill-retard">En retard</span>'
               : '<span class="pill pill-apayer">À payer</span>';
      const pay = edit && i.statut !== 'Payé'
        ? `<button class="btn btn-small btn-primary" onclick="payerImpot('${i.id}')">Payer</button>` : '';
      return `<tr data-s="${esc(norm([i.libelle, i.beneficiaire, i.periode, i.notes].join(' ')))}"
              class="${i.statut === 'Payé' ? 'muted' : late ? 'late' : ''}">
        <td><strong>${esc(i.libelle)}</strong>${i.notes ? `<span class="note-inline">${esc(i.notes)}</span>` : ''}</td>
        <td>${esc(i.beneficiaire)}</td>
        <td>${esc(i.periode || '—')}</td>
        <td data-sort="${esc(i.echeance || '')}">${fmtDate(i.echeance)}</td>
        <td>${st}</td>
        <td class="num" data-sort="${num(i.montant)}">${septims(i.montant)}</td>
        ${edit ? `<td class="actions">${pay}
          <button class="icon-btn" aria-label="Modifier" onclick="editImpot('${i.id}')">✎</button>
          <button class="icon-btn danger" aria-label="Supprimer" onclick="delImpot('${i.id}')">✕</button></td>` : ''}
      </tr>`;
    }).join('');

  const taxRows = taxables.map(c => {
    const d = taxeDetail(c);
    const last = derniereTaxe(c);
    return `<tr data-s="${esc(norm(c.nom))}">
      <td><strong>${esc(c.nom)}</strong><span class="note-inline">${esc(c.secteur || '—')} · ${esc(c.proprietaire || '')}</span></td>
      <td class="num">${septims(c.benefice)}</td>
      <td class="num muted-text">${septims(d.patente)}</td>
      <td class="num muted-text">${septims(d.taille)}</td>
      <td class="num"><strong>${septims(d.total)}</strong></td>
      <td>${last ? fmtDate(last.date_op) : 'Jamais'}</td>
      ${edit ? `<td class="actions"><button class="btn btn-small btn-primary" onclick="percevoirTaxe('${c.id}')">Percevoir</button></td>` : ''}
    </tr>`;
  }).join('');

  return `${sectionHead('Impôts', 'Ce que la baronnie doit verser au Comté, et les taxes perçues sur ses commerces (Agrément + Taille, Art. IV & V).')}
  <div class="summary-strip">
    <div class="ruled"><span>Reste à verser</span><strong>${septims(totalDu)}</strong></div>
    <div class="${retard.length ? 'alert' : ''}"><span>En retard</span><strong>${retard.length}</strong></div>
    <div><span>Prochaine échéance</span><strong>${next ? fmtDate(next.echeance) : '—'}</strong></div>
    <div><span>Taxes à percevoir</span><strong>${septims(totalTaxes)}</strong></div>
  </div>

  <div class="sheet">
    <h3 class="sheet-title">Dû au Comté</h3>
    ${toolbar({ section: 'impots', searchId: 'imp-q', onSearch: "filterTable('imp-tbody','imp-q')",
      addLabel: 'Ajouter un impôt dû', onAdd: 'editImpot()' })}
    <div class="table-wrap"><table class="ledger">
      <thead><tr>${th('Impôt')}${th('À verser à')}${th('Période')}${th('Échéance')}${th('Statut')}${th('Montant','num')}
        ${edit ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}
      </tr></thead>
      <tbody id="imp-tbody">${impRows || emptyRow(7, edit ? 'Aucun impôt enregistré. Ajoute ce que la baronnie doit au Comté.' : 'Aucun impôt enregistré.')}</tbody>
      <tfoot><tr class="total"><td colspan="5">Reste à verser</td><td class="num">${septims(totalDu)}</td>${edit ? '<td></td>' : ''}</tr></tfoot>
    </table></div>
  </div>

  <div class="sheet">
    <h3 class="sheet-title">Taxe commerciale — Agrément + Taille</h3>
    <div class="callout plain">
      <p>Calcul selon les Lois Fiscales Art. IV & V. Agrément : forfait fixe par secteur. Taille : progressif (0 % → 35 %) sur le bénéfice déclaré.</p>
      ${edit && taxables.length ? `<div class="callout-actions"><button class="btn btn-primary" onclick="percevoirTout()">Tout percevoir (${septims(totalTaxes)})</button></div>` : ''}
    </div>
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Commerce</th>${th('Bénéfice','num')}${th('Agrément','num')}${th('Taille','num')}${th('Total dû','num')}<th>Dernière perception</th>
        ${edit ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}
      </tr></thead>
      <tbody>${taxRows || emptyRow(7, 'Aucun commerce taxable.')}</tbody>
      <tfoot><tr class="total"><td colspan="4">Total à percevoir</td><td class="num">${septims(totalTaxes)}</td><td></td>${edit ? '<td></td>' : ''}</tr></tfoot>
    </table></div>
  </div>
  ${sectionHistory(['gp_impots', 'gp_parametres'])}`;
};

function editImpot(id) {
  const row = id ? DB.impots.find(i => i.id === id) : null;
  openEditor({ table: 'gp_impots', section: 'impots', title: 'impôt', fields: IMPOT_FIELDS, row, after: reload });
}
function delImpot(id) {
  const i = DB.impots.find(x => x.id === id);
  removeRow({ table: 'gp_impots', section: 'impots', id, label: i?.libelle, after: reload });
}

function payerImpot(id) {
  const i = DB.impots.find(x => x.id === id);
  if (!i) return;
  openModal({
    title: 'Payer un impôt',
    body: `<p class="modal-text">${esc(i.libelle)} — <strong>${septims(i.montant)}</strong> à verser à ${esc(i.beneficiaire)}.</p>
      <div class="form-grid"><div class="field"><label for="pay-date">Date du paiement</label>
        <input id="pay-date" type="date" value="${today()}"></div></div>`,
    okLabel: `Payer ${septims(i.montant)}`,
    onOk: async () => {
      const d = document.getElementById('pay-date').value || today();
      await apiInsert('gp_operations', {
        date_op: d, sens: 'Dépense', categorie: 'Impôts', auteur: currentAuthor(),
        libelle: `${i.libelle} — ${i.beneficiaire}`, montant: num(i.montant),
        details: i.periode ? `Période : ${i.periode}` : null, impot_id: i.id,
      });
      await apiUpdate('gp_impots', i.id, { statut: 'Payé', paye_le: d });
      toast(`Impôt payé : ${septims(i.montant)} sortis du trésor.`);
      await reload();
    },
  });
}

async function percevoirTaxe(id, silent = false) {
  const c = DB.commerces.find(x => x.id === id);
  const due = taxeDue(c || {});
  if (!c || !due) return;
  const d = taxeDetail(c);
  if (!silent && !await confirmBox(`Percevoir ${septims(due)} sur « ${c.nom} » ?\n(Agrément ${septims(d.patente)} + Taille ${septims(d.taille)})`, 'Percevoir')) return;
  try {
    await apiInsert('gp_operations', {
      date_op: today(), sens: 'Recette', categorie: 'Taxes', auteur: currentAuthor(),
      libelle: `Taxe commerciale — ${c.nom}`, montant: due, commerce_id: c.id,
      details: `Agrément ${septims(d.patente)} + Taille ${septims(d.taille)} sur bénéfice ${septims(c.benefice)}`,
    });
    if (!silent) { toast(`${septims(due)} perçus sur ${c.nom}.`); await reload(); }
  } catch (e) { toast(errMsg(e), 'err'); throw e; }
}

async function percevoirTout() {
  const list = DB.commerces.filter(c => taxeDue(c) > 0);
  const total = list.reduce((s, c) => s + taxeDue(c), 0);
  if (!await confirmBox(`Percevoir la taxe sur ${list.length} commerce(s), soit ${septims(total)} ?`, 'Tout percevoir')) return;
  let ok = 0;
  for (const c of list) { try { await percevoirTaxe(c.id, true); ok++; } catch (e) { break; } }
  toast(`${ok} taxe(s) perçue(s).`);
  await reload();
}
