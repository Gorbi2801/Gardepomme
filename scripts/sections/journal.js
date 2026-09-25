// ══════════════════════════════════════════════════════════════════════
//  HISTORIQUE — chaque ajout, modification, suppression (trigger gp_log)
//  Visible uniquement par les comptes connectés. Permet d'annuler.
// ══════════════════════════════════════════════════════════════════════
const ACTION_LABEL = { INSERT: 'Ajout', UPDATE: 'Modification', DELETE: 'Suppression' };
const HIDDEN_KEYS = ['id', 'created_at', 'updated_at', 'auteur'];
const FIELD_LABEL = {
  prenom: 'Prénom', nom: 'Nom', race: 'Race', categorie: 'Catégorie', fonction: 'Fonction', salaire: 'Salaire',
  statut: 'Statut', date_entree: 'Entrée', notes: 'Notes', activite: 'Activité', proprietaire: 'Propriétaire',
  membres: 'Membres', emplacement: 'Emplacement', benefice: 'Bénéfice', exonere: 'Exonéré', titre: 'Titre',
  reference: 'Référence', contenu: 'Texte', source: 'Promulgation', ordre: 'Ordre', date_op: 'Date', sens: 'Sens',
  libelle: 'Libellé', montant: 'Montant', details: 'Détails', unite: 'Unité', prix_achat: "Prix d'achat",
  prix_vente: 'Prix de vente', beneficiaire: 'Bénéficiaire', echeance: 'Échéance', periode: 'Période',
  paye_le: 'Payé le', valeur: 'Valeur',
};
let journalCache = [];
let journalFilter = '';

async function fetchJournal(tables, limit = 60) {
  let q = sb.from('gp_journal').select('*').order('created_at', { ascending: false }).limit(limit);
  if (tables?.length) q = q.in('table_name', tables);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function shortVal(v) {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  const s = String(v).replace(/\s+/g, ' ');
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}
function diffText(e) {
  if (e.action !== 'UPDATE' || !e.old_data || !e.new_data) return '';
  const ch = Object.keys(e.new_data).filter(k => !HIDDEN_KEYS.includes(k) && JSON.stringify(e.old_data[k]) !== JSON.stringify(e.new_data[k]));
  if (!ch.length) return '';
  return `<ul class="diff">${ch.map(k => `<li><span>${esc(FIELD_LABEL[k] || k)}</span> ${esc(shortVal(e.old_data[k]))} → ${esc(shortVal(e.new_data[k]))}</li>`).join('')}</ul>`;
}
function undoLabel(e) { return e.action === 'INSERT' ? "Annuler l'ajout" : e.action === 'UPDATE' ? 'Rétablir' : 'Restaurer'; }

function journalEntry(e, showTable) {
  const can = canEdit(TABLE_SECTION[e.table_name]);
  return `<li class="j-${e.action.toLowerCase()}">
    <div class="j-line">
      <span class="j-when">${fmtDateTime(e.created_at)}</span>
      <span class="j-what"><strong>${ACTION_LABEL[e.action] || e.action}</strong>${showTable ? ` · ${esc(TABLE_LABEL[e.table_name] || e.table_name)}` : ''} — ${esc(e.label || '—')}</span>
      <span class="j-who">${esc(e.auteur || '—')}</span>
      ${can ? `<button class="btn btn-small btn-ghost" onclick="undoJournal(${e.id})">${undoLabel(e)}</button>` : ''}
    </div>
    ${diffText(e)}
  </li>`;
}

// Bloc repliable en bas de chaque section
function sectionHistory(tables) {
  if (!isLogged()) return '';
  return `<details class="history" data-tables="${tables.join(',')}" ontoggle="loadHistory(this)">
    <summary>Historique des modifications</summary>
    <div class="history-body"><p class="muted-text">Chargement…</p></div>
  </details>`;
}
async function loadHistory(el) {
  if (!el.open) return;
  const body = el.querySelector('.history-body');
  try {
    const rows = await fetchJournal(el.dataset.tables.split(','), 25);
    rows.forEach(r => { if (!journalCache.find(x => x.id === r.id)) journalCache.push(r); });
    body.innerHTML = rows.length ? `<ul class="journal">${rows.map(r => journalEntry(r, el.dataset.tables.includes(','))).join('')}</ul>` : '<p class="muted-text">Aucune modification enregistrée.</p>';
  } catch (e) { body.innerHTML = `<p class="muted-text">${esc(errMsg(e))}</p>`; }
}

// Section complète
RENDERERS.journal = () => `${sectionHead('Historique', 'Toutes les modifications du livret, les plus récentes en premier. Chaque ligne peut être annulée par un compte qui a le droit sur la section concernée.')}
  <div class="sheet">
    <div class="toolbar">
      <select id="j-table" onchange="journalFilter=this.value;loadJournalPage()" aria-label="Filtrer par section">
        <option value="">Toutes les sections</option>
        ${Object.entries(TABLE_LABEL).map(([t, l]) => `<option value="${t}"${t === journalFilter ? ' selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
    </div>
    <div id="journal-body"><p class="muted-text">Chargement…</p></div>
  </div>`;
RENDERERS['journal:after'] = () => loadJournalPage();

async function loadJournalPage() {
  const box = document.getElementById('journal-body');
  if (!box) return;
  try {
    const rows = await fetchJournal(journalFilter ? [journalFilter] : null, 300);
    journalCache = rows;
    box.innerHTML = rows.length ? `<ul class="journal">${rows.map(r => journalEntry(r, true)).join('')}</ul>` : '<p class="muted-text">Aucune modification enregistrée.</p>';
  } catch (e) { box.innerHTML = `<p class="muted-text">${esc(errMsg(e))}</p>`; }
}

async function undoJournal(jid) {
  const e = journalCache.find(x => x.id === jid);
  if (!e) return;
  const t = e.table_name;
  const key = t === 'gp_parametres' ? 'cle' : 'id';
  const msg = e.action === 'INSERT' ? `Annuler l'ajout de « ${e.label} » ? L'entrée sera supprimée.`
    : e.action === 'UPDATE' ? `Rétablir « ${e.label} » tel qu'il était avant cette modification ?`
    : `Restaurer « ${e.label} » dans le livret ?`;
  if (!await confirmBox(msg, undoLabel(e))) return;
  try {
    if (e.action === 'INSERT') {
      await apiDelete(t, e.row_id, key);
    } else if (e.action === 'UPDATE') {
      const patch = { ...e.old_data };
      HIDDEN_KEYS.forEach(k => delete patch[k]);
      if (key === 'cle') delete patch.cle;
      await apiUpdate(t, e.row_id, patch, key);
    } else {
      const row = { ...e.old_data };
      delete row.updated_at;
      const { error } = await sb.from(t).insert(row);
      if (error) throw error;
    }
    toast('Action annulée.');
    await reload();
    if (activeSection === 'journal') loadJournalPage();
  } catch (err) {
    const m = errMsg(err);
    toast(/duplicate key/i.test(m) ? 'Cette entrée existe déjà dans le livret.' : /no rows|0 rows|JSON object requested/i.test(m) ? "L'entrée n'existe plus : elle a été supprimée depuis." : m, 'err');
  }
}
