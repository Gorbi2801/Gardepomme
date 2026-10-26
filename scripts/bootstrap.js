// ══════════════════════════════════════════════════════════════════════
//  DÉMARRAGE — chargé en dernier
// ══════════════════════════════════════════════════════════════════════
(async function init() {
  if (!window.GardepommeConfig?.supabaseUrl || !window.GardepommeConfig?.supabaseKey) {
    document.getElementById('page').innerHTML = `
      <section class="sheet" role="alert" style="margin:2rem;padding:1.5rem">
        <h2>Configuration Supabase introuvable</h2>
        <p>Vérifie les secrets GitHub (<code>SUPABASEURL</code>, <code>SUPABASEKEY</code>)
        et relance le workflow.</p>
      </section>`;
    return;
  }
  if (!window.supabase?.createClient) {
    document.getElementById('page').innerHTML =
      '<section class="sheet" role="alert" style="margin:2rem;padding:1.5rem"><h2>Bibliothèque Supabase indisponible</h2><p>Vérifie ta connexion.</p></section>';
    return;
  }

  document.addEventListener('keydown', e => {
    const modalOpen = !document.getElementById('modal').hidden;
    if (e.key === 'Escape' && modalOpen) closeModal();
    if (e.key === 'Enter' && modalOpen && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
      e.preventDefault(); modalOk();
    }
  });
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
  });

  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h !== activeSection && SECTIONS[h]) go(h);
  });

  const hash = location.hash.replace('#', '');
  if (SECTIONS[hash]) activeSection = hash;

  loadSession();      // restaure le mode intendance depuis sessionStorage
  await refreshAll(); // charge les données et affiche

  // Vérifie toutes les 5 min si une semaine vient de se terminer
  // (rattrape le passage dimanche 23h59 → lundi 00h00 si l'app est ouverte)
  setInterval(async () => {
    if (typeof autoClosePastWeeks !== 'function') return;
    const n = await autoClosePastWeeks();
    if (n > 0) { await loadData(); renderActive(); toast(`${n} semaine${n > 1 ? 's' : ''} archivée${n > 1 ? 's' : ''} automatiquement.`); }
  }, 5 * 60 * 1000);
})();
