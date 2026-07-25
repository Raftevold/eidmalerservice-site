// Administrasjonsgrensesnittet.
// Alt innhald blir henta som JSON, redigert i minnet og lagra samla.
// Ingen inline-skript eller -stilar, slik at CSP-en kan vere streng.

(function () {
  'use strict';

  var innhald = null;
  var bilete = { innebygde: [], opplasta: [] };
  var aktivFane = 'oversikt';
  var uLagra = false;

  // Går økta ut medan panelet står ope, svarar serveren 401. Då sender vi
  // brukaren til innlogginga i staden for å vise ei kryptisk feilmelding.
  function hent(url, val) {
    return fetch(url, val).then(function (r) {
      if (r.status === 401) {
        window.location.href = '/admin/login';
        throw new Error('Økta er utgått – logg inn på nytt');
      }
      return r;
    });
  }

  var ut = document.getElementById('admInnhald');
  var statusFelt = document.getElementById('lagreStatus');
  var lagreKnapp = document.getElementById('lagreKnapp');
  var modal = document.getElementById('bildeModal');
  var modalKropp = document.getElementById('bildeModalKropp');

  /* ---------- små byggjeklossar ---------- */

  function lag(tag, klasse, tekst) {
    var el = document.createElement(tag);
    if (klasse) el.className = klasse;
    if (tekst != null) el.textContent = tekst;
    return el;
  }

  function merkEndra() {
    uLagra = true;
    statusFelt.classList.remove('adm__status--feil');
    statusFelt.textContent = 'Ulagrede endringer';
  }

  // Lagar eit merka skjemafelt bunde til obj[nokkel]
  function felt(etikett, obj, nokkel, type, hjelp) {
    var wrap = lag('div', 'felt');
    var id = 'f_' + Math.random().toString(36).slice(2, 9);
    var lab = lag('label', null, etikett);
    lab.setAttribute('for', id);
    if (hjelp) {
      var h = lag('span', 'hint', ' ' + hjelp);
      lab.appendChild(h);
    }
    var inn = type === 'tekstomrade' ? lag('textarea') : lag('input');
    if (type && type !== 'tekstomrade') inn.type = type;
    inn.id = id;
    inn.value = obj[nokkel] == null ? '' : obj[nokkel];
    inn.addEventListener('input', function () {
      obj[nokkel] = inn.value;
      merkEndra();
    });
    wrap.appendChild(lab);
    wrap.appendChild(inn);
    return wrap;
  }

  function bryter(etikett, obj, nokkel) {
    var lab = lag('label', 'bryter');
    var inn = lag('input');
    inn.type = 'checkbox';
    inn.checked = Boolean(obj[nokkel]);
    inn.addEventListener('change', function () {
      obj[nokkel] = inn.checked;
      merkEndra();
      if (aktivFane === 'varsel') tegn();
    });
    var spor = lag('span', 'bryter__spor');
    lab.appendChild(inn);
    lab.appendChild(spor);
    lab.appendChild(lag('span', null, etikett));
    return lab;
  }

  function boks(tittel, hjelp) {
    var b = lag('div', 'boks');
    if (tittel) {
      var topp = lag('div', 'boks__topp');
      topp.appendChild(lag('h2', null, tittel));
      b.appendChild(topp);
      b._topp = topp;
    }
    if (hjelp) b.appendChild(lag('p', 'boks__hjelp', hjelp));
    return b;
  }

  function knapp(tekst, klasse, ved) {
    var k = lag('button', klasse || 'miniknapp', tekst);
    k.type = 'button';
    k.addEventListener('click', ved);
    return k;
  }

  /* ---------- biletveljar ---------- */

  function bildeUrlFor(id) {
    if (!id) return null;
    if (id.indexOf('opplast:') === 0) return '/opplast/' + id.slice(8);
    var t = bilete.innebygde.filter(function (b) { return b.id === id; })[0];
    return t ? t.url : null;
  }

  // Knapp som viser gjeldande bilete og opnar veljaren
  function bildeveljar(obj, nokkel) {
    var rute = lag('button', 'bilderute');
    rute.type = 'button';

    function tegnRute() {
      rute.textContent = '';
      var url = bildeUrlFor(obj[nokkel]);
      if (url) {
        var img = lag('img');
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        rute.appendChild(img);
        rute.appendChild(lag('span', 'bilderute__overlegg', 'Bytt bilde'));
      } else {
        rute.appendChild(lag('span', 'bilderute__tom', 'Ingen bilde – klikk for å velge'));
      }
    }

    rute.addEventListener('click', function () {
      opneVeljar(function (valgt) {
        obj[nokkel] = valgt;
        merkEndra();
        tegnRute();
      });
    });

    tegnRute();
    return rute;
  }

  function opneVeljar(velg) {
    modalKropp.textContent = '';

    var laster = lag('p', 'adm__lastar', 'Henter bilder …');
    modalKropp.appendChild(laster);
    modal.hidden = false;

    hentBilete().then(function () {
      modalKropp.textContent = '';

      // Last opp nytt, direkte frå veljaren
      modalKropp.appendChild(lag('h3', null, 'Last opp nytt bilde'));
      modalKropp.appendChild(lagOpplastSone(function (nytt) {
        velg(nytt.id);
        modal.hidden = true;
      }));

      modalKropp.appendChild(lag('h3', null, 'Bilder fra nettsiden'));
      modalKropp.appendChild(veljarRutenett(bilete.innebygde, velg));

      modalKropp.appendChild(lag('h3', null, 'Dine opplastede bilder'));
      if (bilete.opplasta.length) {
        modalKropp.appendChild(veljarRutenett(bilete.opplasta, velg));
      } else {
        modalKropp.appendChild(lag('p', 'adm__lastar', 'Du har ikke lastet opp bilder ennå.'));
      }

      var fjern = knapp('Fjern bildet', 'miniknapp miniknapp--fare', function () {
        velg('');
        modal.hidden = true;
      });
      var p = lag('p');
      p.appendChild(fjern);
      modalKropp.appendChild(lag('h3', null, 'Eller'));
      modalKropp.appendChild(p);
    });
  }

  function veljarRutenett(liste, velg) {
    var rut = lag('div', 'veljar');
    liste.forEach(function (b) {
      var k = lag('button', 'veljar__kort');
      k.type = 'button';
      var img = lag('img');
      img.src = b.url;
      img.alt = '';
      img.loading = 'lazy';
      k.appendChild(img);
      k.appendChild(lag('span', null, b.fil || b.id));
      k.addEventListener('click', function () {
        velg(b.id);
        modal.hidden = true;
      });
      rut.appendChild(k);
    });
    return rut;
  }

  document.getElementById('bildeModalLukk').addEventListener('click', function () { modal.hidden = true; });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });

  /* ---------- opplasting med førehandsvising ---------- */

  function lagOpplastSone(ferdig) {
    var wrap = lag('div');
    var sone = lag('div', 'opplast-sone');
    sone.appendChild(lag('strong', null, 'Dra bilder hit, eller klikk for å velge'));
    sone.appendChild(lag('span', null, 'JPG, PNG, HEIC eller WEBP. Bildene komprimeres automatisk.'));

    var input = lag('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;

    var forhand = lag('div', 'forhandsvis');

    sone.addEventListener('click', function () { input.click(); });
    sone.addEventListener('dragover', function (e) { e.preventDefault(); sone.classList.add('er-over'); });
    sone.addEventListener('dragleave', function () { sone.classList.remove('er-over'); });
    sone.addEventListener('drop', function (e) {
      e.preventDefault();
      sone.classList.remove('er-over');
      handterFiler(e.dataTransfer.files);
    });
    input.addEventListener('change', function () { handterFiler(input.files); });

    // Éin opplasting om gongen. Slepper ein inn fem store kamerabilete samtidig,
    // ville parallelle sharp-jobbar kunne sprengje minnet på den vesle instansen.
    var opplastKoe = Promise.resolve();

    function handterFiler(filer) {
      Array.prototype.forEach.call(filer, function (fil) {
        if (!/^image\//.test(fil.type)) return;

        // Vis biletet med ein gong, før opplastinga er ferdig
        var kort = lag('div', 'forhandsvis__kort');
        var img = lag('img');
        img.src = URL.createObjectURL(fil);
        img.alt = '';
        var merke = lag('span', 'forhandsvis__merke', 'Laster opp …');
        kort.appendChild(img);
        kort.appendChild(merke);
        forhand.appendChild(kort);

        var data = new FormData();
        data.append('fil', fil);
        opplastKoe = opplastKoe.then(function () {
          return hent('/admin/api/bilete', { method: 'POST', body: data });
        })
          .then(function (r) { return r.json(); })
          .then(function (svar) {
            if (svar.feil) throw new Error(svar.feil);
            merke.textContent = 'Lastet opp';
            img.src = svar.url;
            bilete.opplasta.unshift({ id: svar.id, url: svar.url, fil: svar.id.slice(8) });
            if (ferdig) ferdig(svar);
          })
          .catch(function (e) {
            merke.textContent = 'Feilet: ' + e.message;
          });
      });
    }

    wrap.appendChild(sone);
    wrap.appendChild(input);
    wrap.appendChild(forhand);
    return wrap;
  }

  /* ---------- faner ---------- */

  var faner = {};

  faner.oversikt = function () {
    var d = lag('div', 'adm__seksjon');
    d.appendChild(lag('h1', null, 'Oversikt'));
    d.appendChild(lag('p', 'adm__leiing',
      'Her styrer du alt innholdet på nettsiden. Velg en seksjon til venstre, gjør endringene dine, og trykk «Lagre endringer» øverst til høyre. Endringene er synlige på nettsiden med én gang.'));

    var ulest = (window.__meldingar || []).filter(function (m) { return !m.lest; }).length;
    var rut = lag('div', 'snarveg-rutenett');

    function snarveg(tal, tekst, fane) {
      var k = lag('button', 'snarveg');
      k.type = 'button';
      k.appendChild(lag('b', null, String(tal)));
      k.appendChild(lag('span', null, tekst));
      k.addEventListener('click', function () { byttFane(fane); });
      return k;
    }

    rut.appendChild(snarveg(ulest, ulest === 1 ? 'ulest henvendelse' : 'uleste henvendelser', 'meldinger'));
    rut.appendChild(snarveg((innhald.tjenester || []).length, 'tjenester', 'tjenester'));
    rut.appendChild(snarveg((innhald.galleri || []).length, 'bilder i galleriet', 'galleri'));
    rut.appendChild(snarveg((innhald.omtaler || []).length, 'omtaler', 'omtaler'));
    d.appendChild(rut);

    var b = boks('Varsellinje øverst på siden',
      'Slå på når dere har ferieavvikling, en kampanje eller en driftsmelding. Linjen vises øverst på alle sider.');
    b.appendChild(bryter(innhald.varsel.aktiv ? 'Varsellinjen er PÅ' : 'Varsellinjen er AV', innhald.varsel, 'aktiv'));
    if (innhald.varsel.aktiv) {
      b.appendChild(felt('Tekst', innhald.varsel, 'tekst'));
    }
    b.appendChild(knapp('Åpne varselinnstillinger', 'miniknapp', function () { byttFane('varsel'); }));
    d.appendChild(b);

    var hjelp = boks('Slik gjør du det');
    var ol = lag('ol', 'liste-lys');
    ['Velg en seksjon i menyen til venstre.',
     'Endre tekst direkte i feltene, eller klikk på et bilde for å bytte det.',
     'Trykk «Lagre endringer» øverst. Da er det ute på nettsiden.'
    ].forEach(function (t) { ol.appendChild(lag('li', null, t)); });
    hjelp.appendChild(ol);
    d.appendChild(hjelp);

    return d;
  };

  faner.varsel = function () {
    var d = lag('div', 'adm__seksjon');
    d.appendChild(lag('h1', null, 'Varsellinje'));
    d.appendChild(lag('p', 'adm__leiing',
      'En smal, gullfarget linje øverst på alle sider. Brukes til ferieavvikling, kampanjer eller driftsmeldinger. Legger du inn en lenke, blir hele linjen klikkbar.'));

    var b = boks();
    b.appendChild(bryter('Vis varsellinjen på nettsiden', innhald.varsel, 'aktiv'));
    var felter = lag('div');
    felter.appendChild(felt('Tekst i linjen', innhald.varsel, 'tekst', 'text', '– f.eks. «Vi har ferielukket 7.–28. juli»'));
    felter.appendChild(felt('Lenke (valgfritt)', innhald.varsel, 'lenke', 'text', '– f.eks. /kontakt eller /aktuelt/feriestengt'));
    b.appendChild(felter);
    d.appendChild(b);

    var f = boks('Slik ser den ut');
    var demo = lag('div', 'varsellinje');
    demo.appendChild(lag('span', null, innhald.varsel.tekst || 'Teksten din vises her'));
    if (innhald.varsel.lenke) demo.appendChild(lag('span', 'varsellinje__pil', '→'));
    f.appendChild(demo);
    if (!innhald.varsel.aktiv) f.appendChild(lag('p', 'boks__hjelp', 'Linjen er avslått og vises ikke på nettsiden nå.'));
    d.appendChild(f);

    return d;
  };

  faner.forside = function () {
    var d = lag('div', 'adm__seksjon');
    var f = innhald.forside;
    d.appendChild(lag('h1', null, 'Forside'));
    d.appendChild(lag('p', 'adm__leiing', 'Toppseksjonen og de viktigste tekstene på forsiden.'));

    var b1 = boks('Toppseksjon');
    var rut = lag('div', 'rutenett-2');
    var venstre = lag('div');
    venstre.appendChild(felt('Liten tekst over overskriften', f, 'heroOvertittel'));
    venstre.appendChild(felt('Hovedoverskrift', f, 'heroTittel'));
    venstre.appendChild(felt('Ingress', f, 'heroIngress', 'tekstomrade'));
    venstre.appendChild(felt('Tekst på hovedknapp', f, 'heroCta'));
    venstre.appendChild(felt('Tekst på ringeknapp', f, 'heroCtaSekundar'));
    var hogre = lag('div');
    hogre.appendChild(lag('p', 'boks__hjelp', 'Bakgrunnsbilde i toppen'));
    hogre.appendChild(bildeveljar(f, 'heroBilde'));
    rut.appendChild(venstre);
    rut.appendChild(hogre);
    b1.appendChild(rut);
    d.appendChild(b1);

    var b2 = boks('Tre nøkkeltall under toppseksjonen');
    (f.nokkeltall || []).forEach(function (n, i) {
      var rad = lag('div', 'rutenett-2');
      rad.appendChild(felt('Tall ' + (i + 1), n, 'tall'));
      rad.appendChild(felt('Tekst ' + (i + 1), n, 'tekst'));
      b2.appendChild(rad);
    });
    d.appendChild(b2);

    var b3 = boks('Overskrifter i seksjonene');
    b3.appendChild(felt('Tittel over tjenestene', f, 'tjenesterTittel'));
    b3.appendChild(felt('Ingress over tjenestene', f, 'tjenesterIngress'));
    b3.appendChild(felt('Tittel på «Hvorfor oss»', f, 'hvorforTittel'));
    d.appendChild(b3);

    var b4 = boks('«Hvorfor velge oss» – tre punkter');
    (f.hvorforPunkter || []).forEach(function (p, i) {
      var e = lag('div', 'element element--utan-bilde');
      var felter = lag('div', 'element__felt');
      felter.appendChild(felt('Tittel', p, 'tittel'));
      felter.appendChild(felt('Tekst', p, 'tekst', 'tekstomrade'));
      e.appendChild(felter);
      var h = lag('div', 'element__handling');
      h.appendChild(knapp('Slett', 'miniknapp miniknapp--fare', function () {
        f.hvorforPunkter.splice(i, 1); merkEndra(); tegn();
      }));
      e.appendChild(h);
      b4.appendChild(e);
    });
    b4._topp.appendChild(knapp('+ Legg til punkt', 'knapp knapp--liten', function () {
      f.hvorforPunkter.push({ tittel: 'Ny tittel', tekst: '' }); merkEndra(); tegn();
    }));
    d.appendChild(b4);

    var b5 = boks('Fargevelgeren', 'Fargene besøkende kan bla gjennom på forsiden. Bruk hex-kode, f.eks. #EFEAE1.');
    (f.fargevegg || []).forEach(function (fa, i) {
      var e = lag('div', 'element element--utan-bilde');
      var felter = lag('div', 'element__felt rutenett-2');
      felter.appendChild(felt('Navn', fa, 'navn'));
      felter.appendChild(felt('Fargekode', fa, 'hex'));
      e.appendChild(felter);
      var h = lag('div', 'element__handling');
      h.appendChild(knapp('Slett', 'miniknapp miniknapp--fare', function () {
        f.fargevegg.splice(i, 1); merkEndra(); tegn();
      }));
      e.appendChild(h);
      b5.appendChild(e);
    });
    b5._topp.appendChild(knapp('+ Legg til farge', 'knapp knapp--liten', function () {
      f.fargevegg.push({ navn: 'Ny farge', hex: '#CCCCCC' }); merkEndra(); tegn();
    }));
    d.appendChild(b5);

    var b6 = boks('Oppfordringen nederst på forsiden');
    b6.appendChild(felt('Tittel', f, 'ctaTittel'));
    b6.appendChild(felt('Tekst', f, 'ctaTekst', 'tekstomrade'));
    b6.appendChild(felt('Tittel på fargevelgeren', f, 'fargeveggTittel'));
    b6.appendChild(felt('Ingress på fargevelgeren', f, 'fargeveggIngress', 'tekstomrade'));
    d.appendChild(b6);

    return d;
  };

  faner.tjenester = function () {
    var d = lag('div', 'adm__seksjon');
    d.appendChild(lag('h1', null, 'Tjenester'));
    d.appendChild(lag('p', 'adm__leiing',
      'Tjenestene vises både som kort på forsiden og som egne avsnitt på Tjenester-siden. Rekkefølgen her er rekkefølgen på nettsiden.'));

    var b = boks('Alle tjenester');
    (innhald.tjenester || []).forEach(function (t, i) {
      var e = lag('div', 'element');
      e.appendChild(bildeveljar(t, 'bilde'));

      var felter = lag('div', 'element__felt');
      felter.appendChild(felt('Navn', t, 'navn'));
      felter.appendChild(felt('Kort beskrivelse', t, 'kort', 'tekstomrade', '– vises på kortet på forsiden'));
      felter.appendChild(felt('Lang beskrivelse', t, 'tekst', 'tekstomrade', '– vises på Tjenester-siden'));
      e.appendChild(felter);

      var h = lag('div', 'element__handling');
      if (i > 0) h.appendChild(knapp('↑ Opp', 'miniknapp', function () {
        var x = innhald.tjenester.splice(i, 1)[0];
        innhald.tjenester.splice(i - 1, 0, x); merkEndra(); tegn();
      }));
      if (i < innhald.tjenester.length - 1) h.appendChild(knapp('↓ Ned', 'miniknapp', function () {
        var x = innhald.tjenester.splice(i, 1)[0];
        innhald.tjenester.splice(i + 1, 0, x); merkEndra(); tegn();
      }));
      h.appendChild(knapp('Slett', 'miniknapp miniknapp--fare', function () {
        if (!confirm('Slette tjenesten «' + t.navn + '»?')) return;
        innhald.tjenester.splice(i, 1); merkEndra(); tegn();
      }));
      e.appendChild(h);
      b.appendChild(e);
    });

    b._topp.appendChild(knapp('+ Ny tjeneste', 'knapp knapp--liten', function () {
      innhald.tjenester.push({
        id: 'tjeneste-' + Date.now(), navn: 'Ny tjeneste', kort: '', tekst: '', bilde: '',
      });
      merkEndra(); tegn();
    }));
    d.appendChild(b);
    return d;
  };

  faner.galleri = function () {
    var d = lag('div', 'adm__seksjon');
    d.appendChild(lag('h1', null, 'Galleri'));
    d.appendChild(lag('p', 'adm__leiing',
      'Bildene som vises på Prosjekter-siden. De tre første vises også på forsiden. Teksten under hvert bilde brukes som bildebeskrivelse, og leses opp for svaksynte.'));

    var b = boks('Bilder i galleriet');
    (innhald.galleri || []).forEach(function (g, i) {
      var e = lag('div', 'element');
      e.appendChild(bildeveljar(g, 'bilde'));
      var felter = lag('div', 'element__felt');
      felter.appendChild(felt('Bildetekst', g, 'tekst', 'tekstomrade'));
      if (i < 3) felter.appendChild(lag('span', 'merkelapp', 'Vises på forsiden'));
      e.appendChild(felter);
      var h = lag('div', 'element__handling');
      if (i > 0) h.appendChild(knapp('↑ Opp', 'miniknapp', function () {
        var x = innhald.galleri.splice(i, 1)[0];
        innhald.galleri.splice(i - 1, 0, x); merkEndra(); tegn();
      }));
      if (i < innhald.galleri.length - 1) h.appendChild(knapp('↓ Ned', 'miniknapp', function () {
        var x = innhald.galleri.splice(i, 1)[0];
        innhald.galleri.splice(i + 1, 0, x); merkEndra(); tegn();
      }));
      h.appendChild(knapp('Slett', 'miniknapp miniknapp--fare', function () {
        innhald.galleri.splice(i, 1); merkEndra(); tegn();
      }));
      e.appendChild(h);
      b.appendChild(e);
    });
    b._topp.appendChild(knapp('+ Nytt bilde', 'knapp knapp--liten', function () {
      innhald.galleri.push({ bilde: '', tekst: '' }); merkEndra(); tegn();
    }));
    d.appendChild(b);
    return d;
  };

  faner.omoss = function () {
    var d = lag('div', 'adm__seksjon');
    var o = innhald.omOss;
    d.appendChild(lag('h1', null, 'Om oss'));
    d.appendChild(lag('p', 'adm__leiing', 'Teksten på Om oss-siden. Trykk enter for nytt avsnitt.'));

    var b = boks();
    var rut = lag('div', 'rutenett-2');
    var v = lag('div');
    v.appendChild(felt('Tittel', o, 'tittel'));
    v.appendChild(felt('Ingress', o, 'ingress', 'tekstomrade'));
    v.appendChild(felt('Brødtekst', o, 'tekst', 'tekstomrade'));
    v.appendChild(felt('Daglig leder', o, 'dagligLeder'));
    var h = lag('div');
    h.appendChild(lag('p', 'boks__hjelp', 'Bilde på siden'));
    h.appendChild(bildeveljar(o, 'bilde'));
    rut.appendChild(v);
    rut.appendChild(h);
    b.appendChild(rut);
    d.appendChild(b);
    return d;
  };

  faner.omtaler = function () {
    var d = lag('div', 'adm__seksjon');
    d.appendChild(lag('h1', null, 'Omtaler'));
    d.appendChild(lag('p', 'adm__leiing',
      'Tilbakemeldinger fra kunder, vist på Prosjekter-siden. Legg bare inn omtaler dere faktisk har fått, og som kunden er kjent med at dere bruker. Er listen tom, vises ingen omtaledel på nettsiden.'));

    var b = boks('Omtaler');
    if (!(innhald.omtaler || []).length) {
      b.appendChild(lag('p', 'tom-melding', 'Ingen omtaler er lagt inn. Nettsiden viser da ingen omtaledel – det er helt greit.'));
    }
    (innhald.omtaler || []).forEach(function (o, i) {
      var e = lag('div', 'element element--utan-bilde');
      var felter = lag('div', 'element__felt');
      felter.appendChild(felt('Omtalen', o, 'tekst', 'tekstomrade'));
      var r = lag('div', 'rutenett-2');
      r.appendChild(felt('Navn', o, 'navn'));
      r.appendChild(felt('Kilde', o, 'kilde', 'text', '– f.eks. «fra Google-omtaler»'));
      felter.appendChild(r);
      e.appendChild(felter);
      var h = lag('div', 'element__handling');
      h.appendChild(knapp('Slett', 'miniknapp miniknapp--fare', function () {
        innhald.omtaler.splice(i, 1); merkEndra(); tegn();
      }));
      e.appendChild(h);
      b.appendChild(e);
    });
    b._topp.appendChild(knapp('+ Ny omtale', 'knapp knapp--liten', function () {
      if (!innhald.omtaler) innhald.omtaler = [];
      innhald.omtaler.push({ tekst: '', navn: '', kilde: '' }); merkEndra(); tegn();
    }));
    d.appendChild(b);
    return d;
  };

  faner.bedrift = function () {
    var d = lag('div', 'adm__seksjon');
    var v = innhald.bedrift;
    d.appendChild(lag('h1', null, 'Kontakt og åpningstider'));
    d.appendChild(lag('p', 'adm__leiing', 'Denne informasjonen vises i bunnen av alle sider, på kontaktsiden, og sendes til Google som bedriftsinformasjon.'));

    var b1 = boks('Kontaktinformasjon');
    var r1 = lag('div', 'rutenett-2');
    r1.appendChild(felt('Bedriftsnavn', v, 'navn'));
    r1.appendChild(felt('Organisasjonsnummer', v, 'orgnr'));
    r1.appendChild(felt('Telefon', v, 'telefon'));
    r1.appendChild(felt('E-post', v, 'epost', 'email'));
    r1.appendChild(felt('Gateadresse', v, 'adresse'));
    var r1b = lag('div', 'rutenett-2');
    r1b.appendChild(felt('Postnummer', v, 'postnr'));
    r1b.appendChild(felt('Poststed', v, 'poststed'));
    b1.appendChild(r1);
    b1.appendChild(r1b);
    d.appendChild(b1);

    var b2 = boks('Sosiale medier');
    b2.appendChild(felt('Facebook-lenke', v, 'facebook'));
    b2.appendChild(felt('Instagram-lenke', v, 'instagram', 'text', '– la stå tom hvis dere ikke har'));
    d.appendChild(b2);

    var b3 = boks('Åpningstider');
    if (v.apningstiderErPlassholder) {
      b3.appendChild(lag('p', 'plassholder-merke',
        'Disse tidene er en plassholder og er ikke bekreftet. Rett dem, og slå av markeringen under når de stemmer.'));
    }
    (v.apningstider || []).forEach(function (a, i) {
      var e = lag('div', 'element element--utan-bilde');
      var felter = lag('div', 'element__felt rutenett-2');
      felter.appendChild(felt('Dager', a, 'dag'));
      felter.appendChild(felt('Tider', a, 'tid'));
      e.appendChild(felter);
      var h = lag('div', 'element__handling');
      h.appendChild(knapp('Slett', 'miniknapp miniknapp--fare', function () {
        v.apningstider.splice(i, 1); merkEndra(); tegn();
      }));
      e.appendChild(h);
      b3.appendChild(e);
    });
    b3._topp.appendChild(knapp('+ Ny rad', 'knapp knapp--liten', function () {
      v.apningstider.push({ dag: '', tid: '' }); merkEndra(); tegn();
    }));
    b3.appendChild(bryter('Merk tidene som ubekreftet plassholder', v, 'apningstiderErPlassholder'));
    b3.appendChild(felt('Tekst på plassholdermerket', v, 'apningstiderNotat', 'tekstomrade'));
    d.appendChild(b3);

    return d;
  };

  faner.seo = function () {
    var d = lag('div', 'adm__seksjon');
    d.appendChild(lag('h1', null, 'Søkemotoroptimalisering'));
    d.appendChild(lag('p', 'adm__leiing',
      'Tittelen og beskrivelsen som vises i Google-treffet for hver side. Hold tittelen under ca. 60 tegn og beskrivelsen under ca. 155 tegn.'));

    var namn = {
      forside: 'Forsiden', tjenester: 'Tjenester', prosjekter: 'Prosjekter',
      'om-oss': 'Om oss', kontakt: 'Kontakt', personvern: 'Personvern',
    };
    Object.keys(innhald.seo || {}).forEach(function (side) {
      var b = boks(namn[side] || side);
      b.appendChild(felt('Sidetittel', innhald.seo[side], 'title'));
      b.appendChild(felt('Beskrivelse', innhald.seo[side], 'description', 'tekstomrade'));
      d.appendChild(b);
    });
    return d;
  };

  faner.bilder = function () {
    var d = lag('div', 'adm__seksjon');
    d.appendChild(lag('h1', null, 'Bildebibliotek'));
    d.appendChild(lag('p', 'adm__leiing',
      'Alle bilder dere har lastet opp. Nye bilder komprimeres automatisk, så de laster raskt på mobil.'));

    var b1 = boks('Last opp nye bilder');
    b1.appendChild(lagOpplastSone(function () { if (aktivFane === 'bilder') tegn(); }));
    d.appendChild(b1);

    var b2 = boks('Opplastede bilder');
    if (!bilete.opplasta.length) {
      b2.appendChild(lag('p', 'tom-melding', 'Ingen opplastede bilder ennå.'));
    } else {
      var rut = lag('div', 'bibliotek');
      bilete.opplasta.forEach(function (bi) {
        var k = lag('div', 'bibliotek__kort');
        var img = lag('img');
        img.src = bi.url;
        img.alt = '';
        img.loading = 'lazy';
        k.appendChild(img);
        k.appendChild(lag('div', 'bibliotek__namn', bi.fil));
        k.appendChild(knapp('Slett', 'bibliotek__slett', function () {
          if (!confirm('Slette dette bildet? Det forsvinner fra alle steder det er brukt.')) return;
          hent('/admin/api/bilete/' + encodeURIComponent(bi.fil), { method: 'DELETE' })
            .then(function (r) { return r.json(); })
            .then(function () { return hentBilete(true); })
            .then(function () { tegn(); });
        }));
        rut.appendChild(k);
      });
      b2.appendChild(rut);
    }
    d.appendChild(b2);

    var b3 = boks('Bilder som følger med nettsiden');
    var rut2 = lag('div', 'bibliotek');
    bilete.innebygde.forEach(function (bi) {
      var k = lag('div', 'bibliotek__kort');
      var img = lag('img');
      img.src = bi.url;
      img.alt = '';
      img.loading = 'lazy';
      k.appendChild(img);
      k.appendChild(lag('div', 'bibliotek__namn', bi.id));
      rut2.appendChild(k);
    });
    b3.appendChild(rut2);
    d.appendChild(b3);

    return d;
  };

  faner.meldinger = function () {
    var d = lag('div', 'adm__seksjon');
    var m = window.__meldingar || [];
    d.appendChild(lag('h1', null, 'Henvendelser'));
    d.appendChild(lag('p', 'adm__leiing',
      'Meldinger sendt inn via kontaktskjemaet på nettsiden. De lagres trygt her, og blir ikke sendt videre til noen andre.'));

    if (!m.length) {
      d.appendChild(lag('p', 'tom-melding', 'Ingen henvendelser ennå.'));
      return d;
    }

    m.forEach(function (melding, i) {
      var e = lag('div', 'melding' + (melding.lest ? '' : ' melding--ulest'));
      var topp = lag('div', 'melding__topp');
      topp.appendChild(lag('span', 'melding__namn', melding.navn));
      if (melding.tjeneste) topp.appendChild(lag('span', 'merkelapp', melding.tjeneste));
      var dato = new Date(melding.tid);
      topp.appendChild(lag('span', 'melding__tid', isNaN(dato) ? melding.tid : dato.toLocaleString('nb-NO')));
      e.appendChild(topp);

      var kontakt = lag('p', 'melding__kontakt');
      if (melding.epost) {
        var a = lag('a', null, melding.epost);
        a.href = 'mailto:' + melding.epost;
        kontakt.appendChild(a);
      }
      if (melding.epost && melding.telefon) kontakt.appendChild(lag('span', null, ' · '));
      if (melding.telefon) {
        var t = lag('a', null, melding.telefon);
        t.href = 'tel:' + melding.telefon.replace(/\s/g, '');
        kontakt.appendChild(t);
      }
      e.appendChild(kontakt);
      e.appendChild(lag('p', 'melding__tekst', melding.melding));

      var h = lag('div', 'melding__handling');
      h.appendChild(knapp(melding.lest ? 'Merk som ulest' : 'Merk som lest', 'miniknapp', function () {
        melding.lest = !melding.lest;
        lagreMeldingar();
      }));
      h.appendChild(knapp('Slett', 'miniknapp miniknapp--fare', function () {
        if (!confirm('Slette denne henvendelsen for godt?')) return;
        window.__meldingar.splice(i, 1);
        lagreMeldingar();
      }));
      e.appendChild(h);
      d.appendChild(e);
    });

    return d;
  };

  faner.tilbud = function () {
    var d = lag('div', 'adm__seksjon');
    if (!window.__tilbod) {
      d.appendChild(lag('p', 'adm__lastar', 'Tilbudsverktøyet kunne ikke lastes.'));
      return d;
    }
    window.__tilbod.tegn(d, {
      tegn: function () { tegn(); },
      hent: hent,
      status: function (tekst, erFeil) {
        statusFelt.classList.toggle('adm__status--feil', Boolean(erFeil));
        statusFelt.textContent = tekst;
      },
    });
    return d;
  };

  /* ---------- tegning og lagring ---------- */

  function tegn() {
    ut.textContent = '';
    ut.appendChild(faner[aktivFane]());
    oppdaterTeljar();
  }

  function byttFane(namn) {
    aktivFane = namn;
    Array.prototype.forEach.call(document.querySelectorAll('.adm__fane'), function (f) {
      f.classList.toggle('er-valgt', f.getAttribute('data-fane') === namn);
    });
    if (namn === 'bilder') {
      hentBilete().then(tegn);
    } else if (namn === 'tilbud' && window.__tilbod) {
      tegn();
      window.__tilbod.last(hent).then(tegn);
    } else {
      tegn();
    }
    window.scrollTo(0, 0);
  }

  Array.prototype.forEach.call(document.querySelectorAll('.adm__fane'), function (f) {
    f.addEventListener('click', function () { byttFane(f.getAttribute('data-fane')); });
  });

  function oppdaterTeljar() {
    var ulest = (window.__meldingar || []).filter(function (m) { return !m.lest; }).length;
    document.getElementById('meldingTeljar').textContent = ulest ? String(ulest) : '';
    var tt = document.getElementById('tilbodTeljar');
    if (tt && window.__tilbod) tt.textContent = window.__tilbod.tal();
  }

  function lagreMeldingar() {
    hent('/admin/api/meldingar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(window.__meldingar),
    })
      .then(function (r) { return r.json(); })
      .then(function (svar) {
        if (svar.feil) throw new Error(svar.feil);
        tegn();
      })
      .catch(function (e) {
        statusFelt.classList.add('adm__status--feil');
        statusFelt.textContent = 'Feil: ' + e.message;
      });
  }

  lagreKnapp.addEventListener('click', function () {
    statusFelt.classList.remove('adm__status--feil');
    statusFelt.textContent = 'Lagrer …';
    lagreKnapp.disabled = true;
    hent('/admin/api/innhald', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(innhald),
    })
      .then(function (r) { return r.json(); })
      .then(function (svar) {
        if (svar.feil) throw new Error(svar.feil);
        uLagra = false;
        statusFelt.textContent = 'Lagret ✓';
        setTimeout(function () { if (!uLagra) statusFelt.textContent = ''; }, 4000);
      })
      .catch(function (e) {
        statusFelt.classList.add('adm__status--feil');
        statusFelt.textContent = 'Kunne ikke lagre: ' + e.message;
      })
      .finally(function () { lagreKnapp.disabled = false; });
  });

  window.addEventListener('beforeunload', function (e) {
    if (!uLagra) return;
    e.preventDefault();
    e.returnValue = '';
  });

  var biletHenta = false;
  function hentBilete(tvingn) {
    if (biletHenta && !tvingn) return Promise.resolve();
    return hent('/admin/api/bilete')
      .then(function (r) { return r.json(); })
      .then(function (svar) {
        if (svar.feil) throw new Error(svar.feil);
        bilete = svar;
        biletHenta = true;
      })
      .catch(function () { /* biblioteket er ikkje kritisk for resten */ });
  }

  /* ---------- oppstart ---------- */

  Promise.all([
    hent('/admin/api/innhald').then(function (r) { return r.json(); }),
    hent('/admin/api/meldingar-liste').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }),
    hentBilete(),
  ]).then(function (svar) {
    // Manglar eit felt (t.d. etter ei feilslått lagring), skal panelet framleis
    // kunne opnast og brukast til å rette opp - ikkje krasje.
    innhald = svar[0] && typeof svar[0] === 'object' ? svar[0] : {};
    if (!innhald.bedrift) innhald.bedrift = {};
    if (!Array.isArray(innhald.bedrift.apningstider)) innhald.bedrift.apningstider = [];
    if (!innhald.varsel) innhald.varsel = { aktiv: false, tekst: '', lenke: '' };
    if (!innhald.forside) innhald.forside = {};
    ['nokkeltall', 'hvorforPunkter', 'fargevegg'].forEach(function (n) {
      if (!Array.isArray(innhald.forside[n])) innhald.forside[n] = [];
    });
    ['tjenester', 'galleri', 'omtaler'].forEach(function (n) {
      if (!Array.isArray(innhald[n])) innhald[n] = [];
    });
    if (!innhald.omOss) innhald.omOss = {};
    if (!innhald.kontakt) innhald.kontakt = {};
    if (!innhald.seo) innhald.seo = {};
    window.__meldingar = Array.isArray(svar[1]) ? svar[1] : [];
    tegn();
  }).catch(function (e) {
    ut.textContent = '';
    ut.appendChild(lag('p', 'melding-boks melding-boks--feil', 'Klarte ikke hente innholdet: ' + e.message));
  });
})();
