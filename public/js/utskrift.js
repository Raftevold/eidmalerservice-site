// Utskriftsknappen på tilbodsdokumentet. Eiga fil fordi CSP-en ikkje
// tillèt inline-skript.
document.getElementById('skrivUt').addEventListener('click', function () {
  window.print();
});
