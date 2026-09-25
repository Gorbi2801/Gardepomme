// ══════════════════════════════════════════════════════════════════════
//  DÉMARRAGE — chargé en dernier
// ══════════════════════════════════════════════════════════════════════
(async function init() {
  document.addEventListener('keydown', e => {
    const modalOpen = !document.getElementById('modal').hidden;
    if (e.key === 'Escape' && modalOpen) closeModal();
    if (e.key === 'Enter' && modalOpen && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); modalOk(); }
  });
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h !== activeSection && SECTIONS[h]) go(h);
  });

  const hash = location.hash.replace('#', '');
  if (SECTIONS[hash]) activeSection = hash;

  await loadSession();
  await refreshAll();
})();
