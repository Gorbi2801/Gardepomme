// ══════════════════════════════════════════════════════════════════════
//  IMPÔTS — tableau de bord automatique
//  Lecture seule : tout est calculé depuis les commerces et les paramètres.
//  Pour enregistrer un paiement → Trésor → Dépense → Impôts.
// ══════════════════════════════════════════════════════════════════════

// ── Calculs fiscaux ──────────────────────────────────────────────────
const AGREMENT = {
  'Terre (pâtres & paysans)': 0,
  'Récolte':                  200,
  'Divertissement':            220,
  'Artisanat':                 220,
};
function patenteAmount(secteur) { return AGREMENT[secteur] ?? 220; }

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
  const p = patenteAmount(c.secteur), t = calculerTaille(num(c.benefice));
  return { patente: p, taille: t, total: p + t };
}
function derniereTaxe(c) {
  return DB.operations.find(o => o.commerce_id === c.id && o.categorie === 'Taxes');
}

// ── Paramètres fixes ─────────────────────────────────────────────────
function censMontant()  { return num(DB.params.cens_montant  ?? 45); }
function censSujets()   { return num(DB.params.cens_sujets   ?? 0); }
function loyerTotal()   { return num(DB.params.loyer_total   ?? 0); }
function totalCens()    { return censMontant() * censSujets(); }

RENDERERS.impots = () => {
  const edit = canEdit('impots');
  const taxables = DB.commerces.filter(c => taxeDue(c) > 0);
  const totalTaxes = taxables.reduce((s, c) => s + taxeDue(c), 0);
  const totalFixed = totalCens() + loyerTotal();
  const grandTotal = totalTaxes + totalFixed;

  // Taxes commerciales
  const taxRows = taxables.map(c => {
    const d = taxeDetail(c);
    const last = derniereTaxe(c);
    return `<tr>
      <td><strong>${esc(c.nom)}</strong><span class="note-inline">${esc(c.secteur || '—')} · ${esc(c.proprietaire || '')}</span></td>
      <td class="num">${septims(c.benefice)}</td>
      <td class="num muted-text">${septims(d.patente)}</td>
      <td class="num muted-text">${septims(d.taille)}</td>
      <td class="num"><strong>${septims(d.total)}</strong></td>
      <td class="muted-text">${last ? fmtDate(last.date_op) : 'Jamais'}</td>
      ${edit ? `<td class="actions"><button class="btn btn-small btn-primary" onclick="percevoirTaxe('${c.id}')">Percevoir</button></td>` : ''}
    </tr>`;
  }).join('');

  return `${sectionHead('Impôts', 'Récapitulatif automatique des taxes dues cette semaine. Tout se calcule depuis les bénéfices des commerces et les paramètres fixes ci-dessous.')}

  <div class="summary-strip">
    <div><span>Taxes commerciales</span><strong>${septims(totalTaxes)}</strong></div>
    <div><span>Cens de Sujétion (${censSujets()} sujets)</span><strong>${septims(totalCens())}</strong></div>
    <div><span>Loyers</span><strong>${septims(loyerTotal())}</strong></div>
    <div class="ruled"><span>Total dû cette semaine</span><strong>${septims(grandTotal)}</strong></div>
  </div>

  <div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.8rem">
      <h3 class="sheet-title" style="margin:0">Taxe commerciale — Agrément + Taille</h3>
      ${edit && taxables.length ? `<button class="btn btn-primary" onclick="percevoirTout()">Tout percevoir (${septims(totalTaxes)})</button>` : ''}
    </div>
    <p class="lead-in">Calculé depuis les bénéfices déclarés dans les Commerces. Mise à jour automatique à chaque modification.</p>
    <div class="table-wrap"><table class="ledger">
      <thead><tr>
        <th>Commerce</th>${th('Bénéfice','num')}${th('Agrément','num')}${th('Taille','num')}${th('Total dû','num')}
        <th>Dernière perception</th>
        ${edit ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}
      </tr></thead>
      <tbody>${taxRows || emptyRow(7, 'Aucun commerce taxable ouvert.')}</tbody>
      <tfoot><tr class="total">
        <td colspan="4">Total taxes commerciales</td>
        <td class="num">${septims(totalTaxes)}</td>
        <td></td>${edit ? '<td></td>' : ''}
      </tr></tfoot>
    </table></div>
  </div>

  <div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.8rem">
      <h3 class="sheet-title" style="margin:0">Impôts fixes (Art. II & III)</h3>
      ${edit ? `<button class="btn btn-ghost" onclick="editParamsFiscaux()">Modifier</button>` : ''}
    </div>
    <p class="lead-in">Montants fixes à configurer une seule fois. Le Cens de Sujétion est de ${septims(censMontant())} par sujet par semaine (Art. II).</p>
    <table class="ledger">
      <thead><tr><th>Impôt</th><th>Détail</th><th class="num">Montant hebdo</th></tr></thead>
      <tbody>
        <tr><td><strong>Cens de Sujétion</strong></td><td>${censSujets()} sujet(s) × ${septims(censMontant())}</td><td class="num">${septims(totalCens())}</td></tr>
        <tr><td><strong>Loyers</strong></td><td>Total des parcelles</td><td class="num">${septims(loyerTotal())}</td></tr>
      </tbody>
      <tfoot><tr class="total"><td colspan="2">Total fixe</td><td class="num">${septims(totalFixed)}</td></tr></tfoot>
    </table>
  </div>`;
};

function editParamsFiscaux() {
  const fields = [
    { key: 'cens_montant', label: 'Montant du Cens de Sujétion (par sujet)', type: 'number', default: 45, hint: 'Art. II — 45 sept. par semaine.' },
    { key: 'cens_sujets', label: 'Nombre de sujets assujettis', type: 'number', default: 0 },
    { key: 'loyer_total', label: 'Total des loyers hebdomadaires', type: 'number', default: 0, hint: 'Art. III — somme de toutes les parcelles.' },
  ];
  openModal({
    title: 'Paramètres fiscaux fixes',
    body: renderFields(fields, DB.params),
    okLabel: 'Enregistrer',
    onOk: async () => {
      const v = readFields(fields);
      for (const [cle, valeur] of Object.entries(v)) {
        await sb.from('gp_parametres').upsert({ cle, valeur: String(valeur ?? 0) });
      }
      toast('Paramètres enregistrés.');
      await reload();
    },
  });
}

async function percevoirTaxe(id, silent = false) {
  const c = DB.commerces.find(x => x.id === id);
  const due = taxeDue(c || {});
  if (!c || !due) return;
  const d = taxeDetail(c);
  if (!silent && !await confirmBox(
    `Percevoir ${septims(due)} sur « ${c.nom} » ?\nAgrément ${septims(d.patente)} + Taille ${septims(d.taille)}`, 'Percevoir')) return;
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
  toast(`${ok} taxe(s) perçue(s).`); await reload();
}
