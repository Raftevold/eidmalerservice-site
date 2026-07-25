// Interaksjonar på den opne delen av sida.
// Alle animasjonar rører berre transform/opacity, og blir slått av
// når brukaren har bedt om redusert rørsle.

(function () {
  'use strict';

  var mindreRorsle = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- topp: markér når sida er rulla --- */
  var topp = document.getElementById('topp');
  if (topp) {
    var oppdaterTopp = function () {
      topp.classList.toggle('er-rulla', window.scrollY > 12);
    };
    oppdaterTopp();
    window.addEventListener('scroll', oppdaterTopp, { passive: true });
  }

  /* --- mobilmeny --- */
  var menyKnapp = document.querySelector('.meny-knapp');
  var nav = document.getElementById('hovudnav');
  if (menyKnapp && nav) {
    var settOpen = function (open) {
      menyKnapp.setAttribute('aria-expanded', String(open));
      menyKnapp.setAttribute('aria-label', open ? 'Lukk meny' : 'Åpne meny');
      nav.classList.toggle('er-open', open);
    };
    menyKnapp.addEventListener('click', function () {
      settOpen(menyKnapp.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') settOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menyKnapp.getAttribute('aria-expanded') === 'true') {
        settOpen(false);
        menyKnapp.focus();
      }
    });
  }

  /* --- scroll-avsløring --- */
  var avslorElement = document.querySelectorAll('.avslor');
  var ornament = document.querySelectorAll('.ornament');

  if (mindreRorsle || !('IntersectionObserver' in window)) {
    avslorElement.forEach(function (el) { el.classList.add('avslor--inn'); });
    ornament.forEach(function (el) { el.classList.add('ornament--synleg'); });
  } else {
    var obs = new IntersectionObserver(function (poster) {
      poster.forEach(function (post) {
        if (!post.isIntersecting) return;
        post.target.classList.add('avslor--inn');
        post.target.classList.add('ornament--synleg');
        obs.unobserve(post.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    avslorElement.forEach(function (el) { obs.observe(el); });
    ornament.forEach(function (el) { obs.observe(el); });
  }

  /* --- teljarar i heroen --- */
  var tal = document.querySelectorAll('[data-tel]');
  if (tal.length) {
    var visTal = function (el) {
      var slutt = parseInt(el.getAttribute('data-tel'), 10);
      if (isNaN(slutt) || mindreRorsle) { el.textContent = el.getAttribute('data-tekst'); return; }
      var start = performance.now();
      var lengd = 1100;
      var steg = function (no) {
        var p = Math.min((no - start) / lengd, 1);
        var lett = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(slutt * lett));
        if (p < 1) requestAnimationFrame(steg);
        else el.textContent = el.getAttribute('data-tekst');
      };
      requestAnimationFrame(steg);
    };
    if ('IntersectionObserver' in window && !mindreRorsle) {
      var talObs = new IntersectionObserver(function (poster) {
        poster.forEach(function (post) {
          if (!post.isIntersecting) return;
          visTal(post.target);
          talObs.unobserve(post.target);
        });
      }, { threshold: 0.5 });
      tal.forEach(function (el) { talObs.observe(el); });
    } else {
      tal.forEach(function (el) { el.textContent = el.getAttribute('data-tekst'); });
    }
  }

  /* --- fargevegg: kryssfading mellom fargelag (berre opacity) --- */
  var fargeknappar = document.querySelectorAll('.farge-knapp');
  if (fargeknappar.length) {
    var namnFelt = document.getElementById('fargeNamn');
    fargeknappar.forEach(function (knapp) {
      knapp.addEventListener('click', function () {
        var id = knapp.getAttribute('data-lag');
        fargeknappar.forEach(function (k) { k.setAttribute('aria-pressed', String(k === knapp)); });
        document.querySelectorAll('.fargevegg__lag').forEach(function (lag) {
          lag.classList.toggle('fargevegg__lag--paa', lag.id === id);
        });
        if (namnFelt) namnFelt.textContent = knapp.getAttribute('data-namn');
      });
    });
  }

  /* --- melding om informasjonskapslar ---
     Sida set ingen sporingskapslar. Meldinga er rein informasjon,
     og valet om å skjule ho blir lagra lokalt i nettlesaren. */
  var boks = document.getElementById('kapselMelding');
  var okKnapp = document.getElementById('kapselOk');
  if (boks && okKnapp) {
    var lagra = null;
    try { lagra = window.localStorage.getItem('ems-kapsel-lest'); } catch (e) { lagra = '1'; }
    if (lagra !== '1') boks.hidden = false;
    okKnapp.addEventListener('click', function () {
      boks.hidden = true;
      try { window.localStorage.setItem('ems-kapsel-lest', '1'); } catch (e) { /* privat modus */ }
    });
  }
})();
