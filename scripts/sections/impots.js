// ══════════════════════════════════════════════════════════════════════
//  IMPÔTS — tableau de bord automatique
//  Taille de la baronnie = calculée depuis les opérations du trésor (semaine courante).
//  Commerces enregistrés = calculés depuis leur bénéfice déclaré.
// ══════════════════════════════════════════════════════════════════════

const AGREMENT = {
  'Terre (pâtres & paysans)': 0,
  'Récolte': 200,
  'Divertissement': 220,
  'Artisanat': 220,
};
const SECTEURS_LISTE = Object.keys(AGREMENT);

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

// Bénéfice hebdo de la baronnie depuis le trésor (Ventes − Achats de la semaine)
function baronnieBeneficeHebdo() {
  const { monday, sunday } = weekRange();
  const from = monday.toISOString().slice(0, 10);
  const to   = sunday.toISOString().slice(0, 10);
  const ops  = DB.operations.filter(o => o.date_op >= from && o.date_op <= to);
  const rec  = ops.filter(o => o.sens === 'Recette' && o.categorie === 'Vente').reduce((s, o) => s + num(o.montant), 0);
  const dep  = ops.filter(o => o.sens === 'Dépense' && o.categorie === 'Achat').reduce((s, o) => s + num(o.montant), 0);
  return { ventes: rec, achats: dep, benefice: Math.max(0, rec - dep) };
}

function baronnieSecteur() { return DB.params.baronnie_secteur || 'Artisanat'; }
function censMontant()  { return num(DB.params.cens_montant ?? 45); }
function censSujets()   { return num(DB.params.cens_sujets  ?? 0); }
function loyerTotal()   { return num(DB.params.loyer_total  ?? 0); }

RENDERERS.impots = () => {
  const edit = canEdit('impots');

  // Baronnie
  const { ventes, achats, benefice } = baronnieBeneficeHebdo();
  const baronPatente = patenteAmount(baronnieSecteur());
  const baronTaille  = calculerTaille(benefice);
  const baronTotal   = baronPatente + baronTaille;

  // Tranches détaillées pour la baronnie
  const trancheRows = (() => {
    const def = [[500, 0], [1000, 0.10], [1000, 0.15], [1500, 0.25], [Infinity, 0.35]];
    let reste = benefice;
    return def.map(([plafond, taux], i) => {
      const part = Math.min(reste, plafond);
      const imp  = Math.round(part * taux);
      reste -= part;
      const label = i === 0 ? '0 à 500 sept.' : i === 1 ? '501 à 1 500 sept.' :
                    i === 2 ? '1 501 à 2 500 sept.' : i === 3 ? '2 501 à 4 000 sept.' : '4 001+ sept.';
      return `<tr class="${part <= 0 ? 'muted' : ''}">
        <td>Tranche ${i+1} — ${label}</td>
        <td class="num">${part > 0 ? septims(part) : '—'}</td>
        <td class="num muted-text">${(taux*100).toFixed(0)} %</td>
        <td class="num">${part > 0 ? septims(imp) : '—'}</td>
      </tr>`;
    }).join('');
  })();

  // Commerces enregistrés
  const taxables = DB.commerces.filter(c => taxeDue(c) > 0);
  const totalCommerces = taxables.reduce((s, c) => s + taxeDue(c), 0);
  const taxRows = taxables.map(c => {
    const d = taxeDetail(c);
    const last = derniereTaxe(c);
    return `<tr>
      <td><strong>${esc(c.nom)}</strong><span class="note-inline">${esc(c.secteur || '—')}</span></td>
      <td class="num">${septims(c.benefice)}</td>
      <td class="num muted-text">${septims(d.patente)}</td>
      <td class="num muted-text">${septims(d.taille)}</td>
      <td class="num"><strong>${septims(d.total)}</strong></td>
      <td class="muted-text">${last ? fmtDate(last.date_op) : 'Jamais'}</td>
      ${edit ? `<td class="actions"><button class="btn btn-small btn-primary" onclick="percevoirTaxe('${c.id}')">Percevoir</button></td>` : ''}
    </tr>`;
  }).join('');

  // Fixes
  const totalCens  = censMontant() * censSujets();
  const totalFixed = totalCens + loyerTotal();
  const grandTotal = baronTotal + totalCommerces + totalFixed;

  return `${sectionHead('Impôts', 'Récapitulatif automatique. La Taille de la baronnie est calculée en direct depuis les ventes et achats inscrits au trésor cette semaine.')}

  <div class="summary-strip">
    <div><span>Taille + Agrément (baronnie)</span><strong>${septims(baronTotal)}</strong></div>
    <div><span>Taxes commerces</span><strong>${septims(totalCommerces)}</strong></div>
    <div><span>Cens & loyers</span><strong>${septims(totalFixed)}</strong></div>
    <div class="ruled"><span>Total dû cette semaine</span><strong>${septims(grandTotal)}</strong></div>
  </div>

  <!-- Baronnie -->
  <div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.5rem">
      <h3 class="sheet-title" style="margin:0">Baronnie de Gardepomme — ${esc(baronnieSecteur())}</h3>
      ${edit ? `<button class="btn btn-ghost" onclick="editParamsFiscaux()">Paramètres</button>` : ''}
    </div>
    <p class="lead-in">Bénéfice hebdo = Ventes (${septims(ventes)}) − Achats (${septims(achats)}) = <strong>${septims(benefice)}</strong></p>
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Tranche</th>${th('Part imposée','num')}${th('Taux','num')}${th('Impôt','num')}</tr></thead>
      <tbody>${trancheRows}</tbody>
      <tfoot>
        <tr class="subtotal"><td colspan="3">Taille</td><td class="num">${septims(baronTaille)}</td></tr>
        <tr class="subtotal"><td colspan="3">Agrément (${esc(baronnieSecteur())})</td><td class="num">${septims(baronPatente)}</td></tr>
        <tr class="total"><td colspan="3">Total baronnie</td><td class="num">${septims(baronTotal)}</td></tr>
      </tfoot>
    </table></div>
  </div>

  <!-- Commerces enregistrés -->
  ${taxables.length ? `<div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.5rem">
      <h3 class="sheet-title" style="margin:0">Commerces enregistrés</h3>
      ${edit ? `<button class="btn btn-primary" onclick="percevoirTout()">Tout percevoir (${septims(totalCommerces)})</button>` : ''}
    </div>
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Commerce</th>${th('Bénéfice déclaré','num')}${th('Agrément','num')}${th('Taille','num')}${th('Total','num')}<th>Dernière perception</th>${edit ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}</tr></thead>
      <tbody>${taxRows}</tbody>
      <tfoot><tr class="total"><td colspan="4">Total commerces</td><td class="num">${septims(totalCommerces)}</td><td></td>${edit ? '<td></td>' : ''}</tr></tfoot>
    </table></div>
  </div>` : ''}

  <!-- Fixes -->
  <div class="sheet">
    <h3 class="sheet-title">Impôts fixes (Art. II & III)</h3>
    <table class="ledger">
      <thead><tr><th>Impôt</th><th>Détail</th><th class="num">Montant hebdo</th></tr></thead>
      <tbody>
        <tr><td><strong>Cens de Sujétion</strong></td><td>${censSujets()} sujet(s) × ${septims(censMontant())}</td><td class="num">${septims(totalCens)}</td></tr>
        <tr><td><strong>Loyers</strong></td><td>Total des parcelles</td><td class="num">${septims(loyerTotal())}</td></tr>
      </tbody>
      <tfoot><tr class="total"><td colspan="2">Total fixe</td><td class="num">${septims(totalFixed)}</td></tr></tfoot>
    </table>
  </div>`;
};

function editParamsFiscaux() {
  const fields = [
    { key: 'baronnie_secteur', label: 'Secteur de la baronnie (Agrément)', type: 'select', options: SECTEURS_LISTE },
    { key: 'cens_montant', label: 'Cens de Sujétion (par sujet)', type: 'number', hint: 'Art. II — 45 sept. par semaine.' },
    { key: 'cens_sujets', label: 'Nombre de sujets assujettis', type: 'number' },
    { key: 'loyer_total', label: 'Total des loyers hebdomadaires', type: 'number', hint: 'Art. III.' },
  ];
  openModal({
    title: 'Paramètres fiscaux',
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
