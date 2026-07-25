// Tilbodsverktøyet i admin.
// Blir lasta som eit eige skript og heng seg på window.__tilbod, som admin.js
// kallar når fana blir vald. Halde utanfor admin.js for å halde filene lesbare.

(function () {
  'use strict';

  var data = null;           // { tilbod, prisbank, malar, einingar, ... }
  var aktivt = null;         // tilbodet som er ope for redigering
  var lyttar = null;         // funksjon som teiknar fana på nytt

  function lag(tag, klasse, tekst) {
    var el = document.createElement(tag);
    if (klasse) el.className = klasse;
    if (tekst != null) el.textContent = tekst;
    return el;
  }

  function kr(n) {
    return (Number(n) || 0).toLocaleString('nb-NO');
  }

  function reknUt(t) {
    var sats = Number(t.mvaSats) || 25;
    var netto = 0;
    (t.linjer || []).forEach(function (l) {
      netto += Math.round((Number(l.mengd) || 0) * (Number(l.einingspris) || 0));
    });
    var mva = Math.round(netto * sats / 100);
    return { netto: netto, mva: mva, sats: sats, brutto: netto + mva };
  }

  /* ---------- felt ---------- */

  function felt(etikett, obj, nokkel, type, hjelp) {
    var wrap = lag('div', 'felt');
    var id = 'tf_' + Math.random().toString(36).slice(2, 9);
    var lab = lag('label', null, etikett);
    lab.setAttribute('for', id);
    if (hjelp) lab.appendChild(lag('span', 'hint', ' ' + hjelp));
    var inn = type === 'tekstomrade' ? lag('textarea') : lag('input');
    if (type && type !== 'tekstomrade') inn.type = type;
    inn.id = id;
    inn.value = obj[nokkel] == null ? '' : obj[nokkel];
    inn.addEventListener('input', function () {
      obj[nokkel] = type === 'number' ? Number(inn.value) : inn.value;
    });
    wrap.appendChild(lab);
    wrap.appendChild(inn);
    return wrap;
  }

  function velg(etikett, obj, nokkel, val, vedEndring) {
    var wrap = lag('div', 'felt');
    var id = 'tv_' + Math.random().toString(36).slice(2, 9);
    var lab = lag('label', null, etikett);
    lab.setAttribute('for', id);
    var sel = lag('select');
    sel.id = id;
    val.forEach(function (v) {
      var o = lag('option', null, v.tekst);
      o.value = v.verdi;
      if (obj[nokkel] === v.verdi) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      obj[nokkel] = sel.value;
      if (vedEndring) vedEndring();
    });
    wrap.appendChild(lab);
    wrap.appendChild(sel);
    return wrap;
  }

  function knapp(tekst, klasse, ved) {
    var k = lag('button', klasse || 'miniknapp', tekst);
    k.type = 'button';
    k.addEventListener('click', ved);
    return k;
  }

  function boks(tittel, klasse) {
    var b = lag('div', 'boks' + (klasse ? ' ' + klasse : ''));
    if (tittel) {
      var topp = lag('div', 'boks__topp');
      topp.appendChild(lag('h2', null, tittel));
      b.appendChild(topp);
      b._topp = topp;
    }
    return b;
  }

  /* ---------- lista over tilbod ---------- */

  function tegnListe(ut, hjelp) {
    var d = lag('div', 'adm__seksjon');
    d.appendChild(lag('h1', null, 'Tilbud'));
    d.appendChild(lag('p', 'adm__leiing',
      'Lag tilbud til kundene, skriv dem ut som PDF, og hold oversikt over hva som er sendt og akseptert. '
      + 'Hver pris dere lagrer havner i prisbanken, slik at neste tilbud går raskere.'));

    var metodar = lag('div', 'metodekort');

    var mManuell = lag('button', 'metode');
    mManuell.type = 'button';
    mManuell.appendChild(lag('strong', null, 'Tomt tilbud'));
    mManuell.appendChild(lag('span', null, 'Start med blanke ark og fyll inn linjene selv.'));
    mManuell.addEventListener('click', function () { nyttTilbod(null, hjelp); });
    metodar.appendChild(mManuell);

    var mMal = lag('button', 'metode');
    mMal.type = 'button';
    mMal.appendChild(lag('strong', null, 'Fra mal'));
    mMal.appendChild(lag('span', null, 'Standardlinjer for jobbtypen, med prisene dere brukte sist.'));
    mMal.addEventListener('click', function () { nyttTilbod('mal', hjelp); });
    metodar.appendChild(mMal);

    var mKi = lag('button', 'metode');
    mKi.type = 'button';
    mKi.appendChild(lag('strong', null, 'Utkast med KI'));
    if (data.kiPaa) {
      mKi.appendChild(lag('span', null, 'Beskriv jobben, så foreslår KI linjer basert på deres egne tidligere tilbud.'));
      mKi.addEventListener('click', function () { nyttTilbod('ki', hjelp); });
    } else {
      mKi.disabled = true;
      mKi.appendChild(lag('span', null, 'Ikke slått på. Krever en API-nøkkel — se README i koden.'));
    }
    metodar.appendChild(mKi);

    d.appendChild(metodar);

    var b = boks('Tilbud (' + (data.tilbod || []).length + ')');
    b._topp.appendChild(knapp('Last ned datagrunnlag (JSONL)', 'miniknapp', function () {
      window.location.href = '/admin/api/tilbod/eksport';
    }));

    if (!(data.tilbod || []).length) {
      b.appendChild(lag('p', 'tom-melding', 'Ingen tilbud ennå. Velg en av metodene over for å lage det første.'));
    } else {
      var liste = lag('div', 'tilbodsliste');
      (data.tilbod || []).forEach(function (t) {
        var rad = lag('div', 'tilbodsrad');
        rad.appendChild(lag('span', 'tilbodsrad__nr', String(t.nr)));

        var kunde = lag('div', 'tilbodsrad__kunde');
        kunde.appendChild(lag('b', null, (t.kunde && t.kunde.navn) || 'Uten navn'));
        var jobbnamn = (data.malar[t.jobb && t.jobb.type] || {}).namn || 'Ikke valgt';
        var dato = t.oppdatert ? new Date(t.oppdatert).toLocaleDateString('nb-NO') : '';
        kunde.appendChild(lag('span', null, jobbnamn + ' · ' + dato));
        rad.appendChild(kunde);

        var s = reknUt(t);
        var sum = lag('div', 'tilbodsrad__sum');
        sum.appendChild(lag('span', null, kr(s.brutto) + ' kr'));
        rad.appendChild(sum);

        var h = lag('div', 'tilbodsrad__handling');
        h.appendChild(lag('span', 'merke-status merke-' + (t.status || 'kladd'),
          { kladd: 'Kladd', sendt: 'Sendt', akseptert: 'Akseptert', avslatt: 'Avslått' }[t.status || 'kladd']));
        h.appendChild(knapp('Åpne', 'miniknapp', function () {
          aktivt = JSON.parse(JSON.stringify(t));
          hjelp.tegn();
        }));
        h.appendChild(knapp('Skriv ut', 'miniknapp', function () {
          window.open('/admin/tilbod/' + t.nr + '/utskrift', '_blank');
        }));
        h.appendChild(knapp('Slett', 'miniknapp miniknapp--fare', function () {
          if (!confirm('Slette tilbud ' + t.nr + '?')) return;
          hjelp.hent('/admin/api/tilbod/' + t.nr, { method: 'DELETE' })
            .then(function () { return lastData(); })
            .then(function () { hjelp.tegn(); });
        }));
        rad.appendChild(h);
        liste.appendChild(rad);
      });
      b.appendChild(liste);
    }
    d.appendChild(b);

    if ((data.prisbank || []).length) {
      var pb = boks('Prisbank (' + data.prisbank.length + ' linjer)');
      pb.appendChild(lag('p', 'boks__hjelp',
        'Prisene dere har brukt før. De fylles inn automatisk når dere lager nye tilbud.'));
      var tab = lag('table', 'linjetabell');
      var thead = lag('thead');
      var hr = lag('tr');
      ['Beskrivelse', 'Enhet', 'Pris', 'Brukt'].forEach(function (h, i) {
        var th = lag('th', i > 1 ? 'h' : null, h);
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      tab.appendChild(thead);
      var tb = lag('tbody');
      data.prisbank.slice(0, 25).forEach(function (p) {
        var tr = lag('tr');
        tr.appendChild(lag('td', null, p.tekst));
        tr.appendChild(lag('td', null, p.eining));
        tr.appendChild(lag('td', 'h', kr(p.einingspris)));
        tr.appendChild(lag('td', 'h', String(p.tal || 1) + '×'));
        tb.appendChild(tr);
      });
      tab.appendChild(tb);
      pb.appendChild(tab);
      d.appendChild(pb);
    }

    ut.appendChild(d);
  }

  function nyttTilbod(metode, hjelp) {
    aktivt = {
      nr: null,
      status: 'kladd',
      kunde: { navn: '', adresse: '', postnr: '', poststed: '', epost: '', telefon: '' },
      jobb: { type: '', bygningstype: '', areal: 0, romtal: 0, tilstand: '', tilkomst: '', notat: '' },
      linjer: [],
      mvaSats: data.mvaSats,
      gyldigDagar: 30,
      atterhald: (data.standardAtterhald || []).slice(),
      utfall: {},
      _metode: metode,
    };
    hjelp.tegn();
  }

  /* ---------- redigering av eitt tilbod ---------- */

  function tegnSkjema(ut, hjelp) {
    var t = aktivt;
    var d = lag('div', 'adm__seksjon');

    d.appendChild(lag('h1', null, t.nr ? 'Tilbud ' + t.nr : 'Nytt tilbud'));

    var topp = lag('div', 'tilbod-topp');
    topp.appendChild(knapp('← Tilbake til listen', 'miniknapp', function () {
      aktivt = null;
      hjelp.tegn();
    }));
    topp.appendChild(knapp('Lagre tilbud', 'knapp knapp--liten', function () { lagre(hjelp); }));
    if (t.nr) {
      topp.appendChild(knapp('Skriv ut / PDF', 'miniknapp', function () {
        window.open('/admin/tilbod/' + t.nr + '/utskrift', '_blank');
      }));
    }
    d.appendChild(topp);

    // Kunde
    var bk = boks('Kunde');
    var r1 = lag('div', 'rutenett-2');
    r1.appendChild(felt('Navn', t.kunde, 'navn'));
    r1.appendChild(felt('Telefon', t.kunde, 'telefon'));
    r1.appendChild(felt('E-post', t.kunde, 'epost', 'email'));
    r1.appendChild(felt('Adresse', t.kunde, 'adresse'));
    r1.appendChild(felt('Postnummer', t.kunde, 'postnr'));
    r1.appendChild(felt('Poststed', t.kunde, 'poststed'));
    bk.appendChild(r1);
    d.appendChild(bk);

    // Jobb
    var bj = boks('Jobben');
    var jobbval = Object.keys(data.malar).map(function (k) {
      return { verdi: k, tekst: data.malar[k].namn };
    });
    jobbval.unshift({ verdi: '', tekst: 'Velg jobbtype …' });
    var r2 = lag('div', 'rutenett-2');
    r2.appendChild(velg('Jobbtype', t.jobb, 'type', jobbval));
    r2.appendChild(velg('Bygningstype', t.jobb, 'bygningstype', [
      { verdi: '', tekst: 'Velg …' },
      { verdi: 'enebolig', tekst: 'Enebolig' },
      { verdi: 'leilighet', tekst: 'Leilighet' },
      { verdi: 'rekkehus', tekst: 'Rekkehus' },
      { verdi: 'naeringsbygg', tekst: 'Næringsbygg' },
      { verdi: 'nybygg', tekst: 'Nybygg' },
    ]));
    r2.appendChild(felt('Areal (m²)', t.jobb, 'areal', 'number'));
    r2.appendChild(felt('Antall rom', t.jobb, 'romtal', 'number'));
    r2.appendChild(velg('Tilstand på underlaget', t.jobb, 'tilstand', [
      { verdi: '', tekst: 'Velg …' },
      { verdi: 'god', tekst: 'God – lite forarbeid' },
      { verdi: 'middels', tekst: 'Middels – noe sparkling/skraping' },
      { verdi: 'darlig', tekst: 'Dårlig – mye forarbeid' },
    ]));
    r2.appendChild(velg('Tilkomst', t.jobb, 'tilkomst', [
      { verdi: '', tekst: 'Velg …' },
      { verdi: 'enkel', tekst: 'Enkel – fra bakken' },
      { verdi: 'stillas', tekst: 'Krever stillas' },
      { verdi: 'lift', tekst: 'Krever lift' },
    ]));
    bj.appendChild(r2);
    bj.appendChild(felt('Notater fra befaring', t.jobb, 'notat', 'tekstomrade',
      '– beskriv omfanget. Jo mer konkret, jo bedre blir KI-utkastet.'));
    d.appendChild(bj);

    // Metode: mal eller KI
    if (t._metode === 'mal' || t._metode === 'ki') {
      var bm = boks(t._metode === 'ki' ? 'Lag utkast med KI' : 'Hent standardlinjer', t._metode === 'ki' ? 'ki-boks' : '');
      if (t._metode === 'ki') {
        bm.appendChild(lag('p', 'boks__hjelp',
          'KI-en får beskrivelsen over, prisbanken deres og tidligere tilbud av samme type. '
          + 'Den foreslår linjer — dere retter og godkjenner før noe sendes. Kundens navn sendes aldri med.'));
        bm.appendChild(knapp('Lag utkast', 'knapp knapp--liten', function () { kiUtkast(bm, hjelp); }));
      } else {
        bm.appendChild(lag('p', 'boks__hjelp', 'Setter inn standardlinjene for jobbtypen, med prisene dere brukte sist.'));
        bm.appendChild(knapp('Hent standardlinjer', 'knapp knapp--liten', function () {
          if (!t.jobb.type) { alert('Velg jobbtype først.'); return; }
          var mal = data.malar[t.jobb.type];
          t.linjer = mal.linjer.map(function (l) {
            var treff = (data.prisbank || []).find(function (p) {
              return p.tekst.toLowerCase() === l.tekst.toLowerCase() && p.eining === l.eining;
            });
            return { tekst: l.tekst, eining: l.eining, mengd: 0, einingspris: treff ? treff.einingspris : 0 };
          });
          hjelp.tegn();
        }));
      }
      d.appendChild(bm);
    }

    // Linjer
    var bl = boks('Varelinjer');
    bl._topp.appendChild(knapp('+ Ny linje', 'knapp knapp--liten', function () {
      t.linjer.push({ tekst: '', eining: 'm2', mengd: 0, einingspris: 0 });
      hjelp.tegn();
    }));

    if (!t.linjer.length) {
      bl.appendChild(lag('p', 'tom-melding', 'Ingen linjer ennå. Legg til en linje, hent en mal, eller lag et KI-utkast.'));
    } else {
      var tab = lag('table', 'linjetabell');
      var thead = lag('thead');
      var hr = lag('tr');
      [['Beskrivelse', ''], ['Mengde', 'h'], ['Enhet', ''], ['Pris eks. mva.', 'h'], ['Sum', 'h'], ['', '']]
        .forEach(function (h) { hr.appendChild(lag('th', h[1], h[0])); });
      thead.appendChild(hr);
      tab.appendChild(thead);

      var tb = lag('tbody');
      t.linjer.forEach(function (l, i) {
        var tr = lag('tr');

        var tdTekst = lag('td');
        var iTekst = lag('input');
        iTekst.type = 'text';
        iTekst.value = l.tekst || '';
        iTekst.addEventListener('input', function () { l.tekst = iTekst.value; });
        tdTekst.appendChild(iTekst);
        tr.appendChild(tdTekst);

        var tdMengd = lag('td', 'kol-mengd');
        var iMengd = lag('input');
        iMengd.type = 'number';
        iMengd.step = 'any';
        iMengd.value = l.mengd || 0;
        iMengd.addEventListener('input', function () {
          l.mengd = Number(iMengd.value) || 0;
          oppdaterSum(t);
        });
        tdMengd.appendChild(iMengd);
        tr.appendChild(tdMengd);

        var tdEining = lag('td', 'kol-eining');
        var sEining = lag('select');
        (data.einingar || []).forEach(function (e) {
          var o = lag('option', null, e);
          o.value = e;
          if (l.eining === e) o.selected = true;
          sEining.appendChild(o);
        });
        sEining.addEventListener('change', function () { l.eining = sEining.value; });
        tdEining.appendChild(sEining);
        tr.appendChild(tdEining);

        var tdPris = lag('td', 'kol-pris');
        var iPris = lag('input');
        iPris.type = 'number';
        iPris.step = 'any';
        iPris.value = l.einingspris || 0;
        iPris.addEventListener('input', function () {
          l.einingspris = Number(iPris.value) || 0;
          oppdaterSum(t);
        });
        tdPris.appendChild(iPris);
        tr.appendChild(tdPris);

        var tdSum = lag('td', 'kol-sum h');
        tdSum.setAttribute('data-linjesum', String(i));
        tdSum.textContent = kr(Math.round((Number(l.mengd) || 0) * (Number(l.einingspris) || 0)));
        tr.appendChild(tdSum);

        var tdFjern = lag('td', 'kol-fjern');
        tdFjern.appendChild(knapp('×', 'miniknapp miniknapp--fare', function () {
          t.linjer.splice(i, 1);
          hjelp.tegn();
        }));
        tr.appendChild(tdFjern);

        tb.appendChild(tr);

        if (l.begrunnelse) {
          var tr2 = lag('tr');
          var td2 = lag('td', 'linjegrunn');
          td2.colSpan = 6;
          td2.textContent = 'KI: ' + l.begrunnelse;
          tr2.appendChild(td2);
          tb.appendChild(tr2);
        }
      });
      tab.appendChild(tb);
      bl.appendChild(tab);

      var sb = lag('div', 'sumboks');
      sb.id = 'sumboks';
      bl.appendChild(sb);
    }
    d.appendChild(bl);

    // Vilkår og status
    var bv = boks('Vilkår og status');
    var r3 = lag('div', 'rutenett-2');
    r3.appendChild(felt('Merverdiavgift (%)', t, 'mvaSats', 'number'));
    r3.appendChild(felt('Gyldig i (dager)', t, 'gyldigDagar', 'number'));
    r3.appendChild(velg('Status', t, 'status', [
      { verdi: 'kladd', tekst: 'Kladd' },
      { verdi: 'sendt', tekst: 'Sendt til kunde' },
      { verdi: 'akseptert', tekst: 'Akseptert' },
      { verdi: 'avslatt', tekst: 'Avslått' },
    ], function () { hjelp.tegn(); }));
    if (t.status === 'avslatt') {
      r3.appendChild(velg('Hvorfor ble det avslått?', t.utfall, 'grunn', [
        { verdi: '', tekst: 'Velg …' },
        { verdi: 'pris', tekst: 'For dyrt' },
        { verdi: 'tid', tekst: 'Vi hadde ikke kapasitet i tide' },
        { verdi: 'annen', tekst: 'Valgte et annet firma' },
        { verdi: 'utsatt', tekst: 'Kunden utsatte jobben' },
        { verdi: 'ukjent', tekst: 'Vet ikke' },
      ]));
    }
    bv.appendChild(r3);

    var atterhaldTekst = { verdi: (t.atterhald || []).join('\n') };
    var fa = felt('Forbehold (én per linje)', atterhaldTekst, 'verdi', 'tekstomrade');
    fa.querySelector('textarea').addEventListener('input', function (e) {
      t.atterhald = e.target.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    });
    bv.appendChild(fa);
    d.appendChild(bv);

    ut.appendChild(d);
    oppdaterSum(t);
  }

  function oppdaterSum(t) {
    var boksEl = document.getElementById('sumboks');
    (t.linjer || []).forEach(function (l, i) {
      var celle = document.querySelector('[data-linjesum="' + i + '"]');
      if (celle) celle.textContent = kr(Math.round((Number(l.mengd) || 0) * (Number(l.einingspris) || 0)));
    });
    if (!boksEl) return;
    var s = reknUt(t);
    boksEl.textContent = '';
    function rad(etikett, verdi, klasse) {
      var r = lag('div', 'sumrad' + (klasse ? ' ' + klasse : ''));
      r.appendChild(lag('span', null, etikett));
      r.appendChild(lag('span', null, verdi));
      return r;
    }
    boksEl.appendChild(rad('Sum eks. mva.', kr(s.netto) + ' kr'));
    boksEl.appendChild(rad('Mva. ' + s.sats + ' %', kr(s.mva) + ' kr'));
    boksEl.appendChild(rad('Å betale', kr(s.brutto) + ' kr', 'sumrad--total'));
  }

  /* ---------- KI ---------- */

  function kiUtkast(boksEl, hjelp) {
    var t = aktivt;
    if (!t.jobb.type) { alert('Velg jobbtype først.'); return; }
    boksEl.classList.add('arbeider');
    var status = boksEl.querySelector('.ki-status') || lag('p', 'ki-status boks__hjelp');
    status.textContent = 'Lager utkast … dette tar gjerne et halvt minutt.';
    boksEl.appendChild(status);

    hjelp.hent('/admin/api/tilbod/ki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobb: t.jobb }),
    })
      .then(function (r) { return r.json(); })
      .then(function (svar) {
        if (svar.feil) throw new Error(svar.feil);
        t.linjer = svar.linjer || [];
        t._kiMerknad = svar.merknad;
        t._kiDoeme = svar.brukteDoeme;
        hjelp.tegn();
        // Vis merknaden etter at fana er teikna på nytt
        var ny = document.querySelector('.ki-boks');
        if (ny && svar.merknad) {
          var m = lag('div', 'ki-merknad');
          m.appendChild(lag('strong', null, 'Sjekk dette på befaringen: '));
          m.appendChild(document.createTextNode(svar.merknad));
          var kjelde = lag('p', 'ki-av',
            'Utkastet bygger på ' + (svar.brukteDoeme || 0) + ' tidligere tilbud av samme type. Gå gjennom hver linje før du sender.');
          ny.appendChild(m);
          ny.appendChild(kjelde);
        }
      })
      .catch(function (e) {
        boksEl.classList.remove('arbeider');
        status.textContent = 'Klarte ikke lage utkast: ' + e.message;
      });
  }

  /* ---------- lagring ---------- */

  function lagre(hjelp) {
    var t = aktivt;
    hjelp.status('Lagrer tilbud …');
    hjelp.hent('/admin/api/tilbod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    })
      .then(function (r) { return r.json(); })
      .then(function (svar) {
        if (svar.feil) throw new Error(svar.feil);
        hjelp.status('Tilbud lagret ✓');
        return lastData();
      })
      .then(function () {
        aktivt = null;
        hjelp.tegn();
      })
      .catch(function (e) { hjelp.status('Kunne ikke lagre: ' + e.message, true); });
  }

  function lastData() {
    return window.__tilbodHent('/admin/api/tilbod')
      .then(function (r) { return r.json(); })
      .then(function (svar) { data = svar; });
  }

  /* ---------- offentleg API mot admin.js ---------- */

  window.__tilbod = {
    last: function (hent) {
      window.__tilbodHent = hent;
      return lastData();
    },
    tegn: function (ut, hjelp) {
      if (!data) {
        ut.appendChild(lag('p', 'adm__lastar', 'Henter tilbud …'));
        return;
      }
      if (aktivt) tegnSkjema(ut, hjelp);
      else tegnListe(ut, hjelp);
    },
    tal: function () {
      if (!data) return '';
      var kladdar = (data.tilbod || []).filter(function (t) { return t.status === 'kladd'; }).length;
      return kladdar ? String(kladdar) : '';
    },
  };
})();
