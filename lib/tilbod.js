// Tilbodsverktøyet: reknestykke, prisbank, malar og KI-assistert utkast.
//
// Tre måtar å lage eit tilbod på, alle med same sluttresultat som admin kan endre:
//   1. Heilt manuelt  - tomme linjer ein fyller ut sjølv
//   2. Frå mal        - standardlinjer for jobbtypen, med prisar frå prisbanken
//   3. KI-utkast      - ein språkmodell foreslår linjer ut frå omfanget, med
//                       bedrifta sine EIGNE tidlegare tilbod og prisar som fasit
//
// Uansett metode er det mennesket som godkjenner. KI-steget krev ein API-nøkkel
// og er heilt valfritt; utan nøkkel fungerer dei to første metodane som normalt.

const MVA_SATS = 25;

// Standard atterhald etter vanleg norsk handverkarskikk.
//
// `standard: true` tyder at atterhaldet blir kryssa av på nye tilbod. Dei andre
// ligg klare i lista, men må hakast av manuelt. Bedrifta kan endre heile lista
// under Oppsett i admin - dette er berre utgangspunktet.
const STANDARD_ATTERHALD = [
  { tekst: 'Prisen forutsetter at arbeidsstedet er ryddet og tilgjengelig når vi starter.', standard: true },
  { tekst: 'Skjulte skader (råte, fukt, sopp) som først viser seg under arbeidet er ikke med i prisen. Vi varsler før vi utfører slikt arbeid.', standard: true },
  { tekst: 'Dersom underlaget krever flere strøk enn forutsatt, avtales dette før arbeidet fortsetter.', standard: true },
  { tekst: 'Prisen gjelder i 30 dager fra tilbudsdato.', standard: true },
  { tekst: 'Strøm og vann på arbeidsstedet stilles til disposisjon av kunden.', standard: false },
  { tekst: 'Ved dokumentert prisøkning på materiell fra leverandør før avtaleinngåelse kan prisene justeres tilsvarende.', standard: false },
  { tekst: 'Arbeid utover det som er spesifisert her utføres etter medgått tid og materiell.', standard: false },
  { tekst: 'Farge- og produktvalg avtales før oppstart. Endringer etter oppstart kan gi tillegg.', standard: false },
];

// Linjer som gjeld uansett kva slags jobb det er. Dei ligg i veljaren på alle
// tilbod, slik at rigg og køyring ikkje må skrivast inn på nytt kvar gong.
const FELLESLINJER = [
  { tekst: 'Kjøring og reise til arbeidssted', eining: 'stk', standard: false },
  { tekst: 'Rigg og klargjøring', eining: 'stk', standard: false },
  { tekst: 'Stillas, leie', eining: 'dag', standard: false },
  { tekst: 'Lift, leie', eining: 'dag', standard: false },
  { tekst: 'Container for avfall', eining: 'stk', standard: false },
  { tekst: 'Arbeid etter medgått tid', eining: 'time', standard: false },
];

// Malar per jobbtype. Mengdene er tomme - dei kjem frå befaringa.
// Einingsprisane blir henta frå prisbanken når bedrifta har lagra liknande linjer.
//
// `standard: true` = linja blir sett inn når ein hentar standardlinjer.
// `standard: false` = linja ligg berre i veljaren, for jobbar der ho trengst.
const MALAR = {
  innvendig: {
    namn: 'Innvendig maling',
    linjer: [
      { tekst: 'Tildekking og klargjøring av rom', eining: 'time', standard: true },
      { tekst: 'Sparkling og sliping av vegger', eining: 'm2', standard: true },
      { tekst: 'Grunning av vegger', eining: 'm2', standard: true },
      { tekst: 'To strøk maling på vegger', eining: 'm2', standard: true },
      { tekst: 'Maling av tak', eining: 'm2', standard: true },
      { tekst: 'Maling av listverk og karmer', eining: 'lm', standard: true },
      { tekst: 'Materialer (maling, sparkel, forbruk)', eining: 'stk', standard: true },
      { tekst: 'Rydding og bortkjøring av avfall', eining: 'stk', standard: true },
      { tekst: 'Fjerning av gammelt tapet', eining: 'm2', standard: false },
      { tekst: 'Flekksparkling av tak', eining: 'm2', standard: false },
      { tekst: 'Maling av innvendige dører', eining: 'stk', standard: false },
      { tekst: 'Maling av radiatorer', eining: 'stk', standard: false },
      { tekst: 'Maling av trapp og rekkverk', eining: 'lm', standard: false },
      { tekst: 'Ekstra strøk på kraftig farge', eining: 'm2', standard: false },
    ],
  },
  utvendig: {
    namn: 'Utvendig maling',
    linjer: [
      { tekst: 'Rigg, stillas og tildekking', eining: 'stk', standard: true },
      { tekst: 'Vask av fasade', eining: 'm2', standard: true },
      { tekst: 'Skraping og fjerning av løs maling', eining: 'm2', standard: true },
      { tekst: 'Grunning av bart treverk', eining: 'm2', standard: true },
      { tekst: 'To strøk maling på kledning', eining: 'm2', standard: true },
      { tekst: 'Maling av vindskier, vindu og dører', eining: 'lm', standard: true },
      { tekst: 'Materialer (maling, grunning, forbruk)', eining: 'stk', standard: true },
      { tekst: 'Nedrigg og rydding', eining: 'stk', standard: true },
      { tekst: 'Soppvask og soppfjerning', eining: 'm2', standard: false },
      { tekst: 'Utskifting av råteskadd kledning', eining: 'lm', standard: false },
      { tekst: 'Beising av terrasse og rekkverk', eining: 'm2', standard: false },
      { tekst: 'Maling av garasjeport', eining: 'stk', standard: false },
      { tekst: 'Tillegg for arbeid over to etasjer', eining: 'm2', standard: false },
    ],
  },
  tapetsering: {
    namn: 'Tapetsering',
    linjer: [
      { tekst: 'Tildekking og klargjøring', eining: 'time', standard: true },
      { tekst: 'Sparkling og sliping av underlag', eining: 'm2', standard: true },
      { tekst: 'Grunning før tapet', eining: 'm2', standard: true },
      { tekst: 'Oppsetting av tapet', eining: 'm2', standard: true },
      { tekst: 'Materialer utenom tapet (lim, grunning)', eining: 'stk', standard: true },
      { tekst: 'Rydding', eining: 'stk', standard: true },
      { tekst: 'Fjerning av eksisterende tapet', eining: 'm2', standard: false },
      { tekst: 'Glassfiberstrie på vegg', eining: 'm2', standard: false },
      { tekst: 'Tillegg for mønstertilpasning', eining: 'm2', standard: false },
      { tekst: 'Fototapet, montering', eining: 'm2', standard: false },
    ],
  },
  gulvlegging: {
    namn: 'Gulvlegging',
    linjer: [
      { tekst: 'Riving av eksisterende gulvbelegg', eining: 'm2', standard: true },
      { tekst: 'Avretting og klargjøring av underlag', eining: 'm2', standard: true },
      { tekst: 'Legging av belegg', eining: 'm2', standard: true },
      { tekst: 'Sveising av skjøter', eining: 'lm', standard: true },
      { tekst: 'Oppbrett mot vegg og listverk', eining: 'lm', standard: true },
      { tekst: 'Materialer (lim, sveisetråd, forbruk)', eining: 'stk', standard: true },
      { tekst: 'Rydding og bortkjøring', eining: 'stk', standard: true },
      { tekst: 'Legging av laminat eller parkett', eining: 'm2', standard: false },
      { tekst: 'Montering av gulvlist', eining: 'lm', standard: false },
      { tekst: 'Sparkelmasse, ekstra tykkelse', eining: 'm2', standard: false },
      { tekst: 'Terskel og overgangslist', eining: 'stk', standard: false },
    ],
  },
  flislegging: {
    namn: 'Flislegging',
    linjer: [
      { tekst: 'Klargjøring og oppmåling av underlag', eining: 'm2', standard: true },
      { tekst: 'Membran på våtrom', eining: 'm2', standard: true },
      { tekst: 'Legging av flis på gulv', eining: 'm2', standard: true },
      { tekst: 'Legging av flis på vegg', eining: 'm2', standard: true },
      { tekst: 'Fuging', eining: 'm2', standard: true },
      { tekst: 'Materialer utenom flis (lim, fugemasse, membran)', eining: 'stk', standard: true },
      { tekst: 'Rydding', eining: 'stk', standard: true },
      { tekst: 'Riving av eksisterende flis', eining: 'm2', standard: false },
      { tekst: 'Fall til sluk', eining: 'stk', standard: false },
      { tekst: 'Silikonfuging mot vegg og innredning', eining: 'lm', standard: false },
      { tekst: 'Tilpasning rundt rør og sluk', eining: 'stk', standard: false },
      { tekst: 'Varmekabel, legging i påstøp', eining: 'm2', standard: false },
    ],
  },
  industribelegg: {
    namn: 'Industribelegg',
    linjer: [
      { tekst: 'Sliping og klargjøring av betongunderlag', eining: 'm2', standard: true },
      { tekst: 'Primer', eining: 'm2', standard: true },
      { tekst: 'Utlegging av industribelegg', eining: 'm2', standard: true },
      { tekst: 'Oppbrett og hulkil', eining: 'lm', standard: true },
      { tekst: 'Materialer', eining: 'stk', standard: true },
      { tekst: 'Rigg og rydding', eining: 'stk', standard: true },
      { tekst: 'Sparkling av hull og sprekker i betong', eining: 'm2', standard: false },
      { tekst: 'Sklisikkert toppstrøk', eining: 'm2', standard: false },
      { tekst: 'Oppmerking av kjørebane og soner', eining: 'lm', standard: false },
      { tekst: 'Fuktmåling av betong', eining: 'stk', standard: false },
    ],
  },
};

const EININGAR = ['m2', 'lm', 'time', 'stk', 'dag'];

/* ---------- oppsett: malar og atterhald bedrifta kan endre sjølv ---------- */
//
// Konstantane over er berre utgangspunktet. Det bedrifta lagrar i admin ligg i
// tilbod.json under `oppsett`, og har forrang. Manglar oppsettet - eller er ein
// del av det ugyldig - fell vi tilbake på standarden, slik at verktøyet aldri
// blir ståande utan malar.

const MAKS_ATTERHALD = 40;
const MAKS_MALAR = 30;
const MAKS_LINJER_PER_MAL = 80;

function standardOppsett() {
  return JSON.parse(JSON.stringify({
    atterhald: STANDARD_ATTERHALD,
    felles: FELLESLINJER,
    malar: MALAR,
  }));
}

function reintTekst(v, maks) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, maks);
}

// Lagar ein trygg nøkkel av eit malnamn: «Utvendig maling» -> «utvendig-maling».
function lagNokkel(namn, brukte) {
  let rot = String(namn || '')
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!rot) rot = 'mal';
  let nokkel = rot;
  let n = 2;
  while (brukte.has(nokkel)) {
    nokkel = rot.slice(0, 37) + '-' + n;
    n += 1;
  }
  return nokkel;
}

function normaliserLinjer(inn, maks) {
  const sett = new Set();
  return (Array.isArray(inn) ? inn : [])
    .map((l) => ({
      tekst: reintTekst(l && l.tekst, 200),
      eining: EININGAR.includes(l && l.eining) ? l.eining : 'stk',
      standard: Boolean(l && l.standard),
    }))
    .filter((l) => {
      if (!l.tekst) return false;
      const n = normaliser(l.tekst) + '|' + l.eining;
      if (sett.has(n)) return false;   // same tekst og eining to gonger gir berre støy i veljaren
      sett.add(n);
      return true;
    })
    .slice(0, maks);
}

// Alt som kjem frå admin-skjemaet går gjennom her før det blir lagra. Vi kappar
// lengder, kastar tomme rader og tvingar einingane inn i den kjende lista.
function normaliserOppsett(inn) {
  const kjelde = inn && typeof inn === 'object' ? inn : {};

  const atterhaldSett = new Set();
  const atterhald = (Array.isArray(kjelde.atterhald) ? kjelde.atterhald : [])
    .map((a) => (typeof a === 'string'
      ? { tekst: reintTekst(a, 500), standard: true }
      : { tekst: reintTekst(a && a.tekst, 500), standard: Boolean(a && a.standard) }))
    .filter((a) => {
      if (!a.tekst) return false;
      const n = normaliser(a.tekst);
      if (atterhaldSett.has(n)) return false;
      atterhaldSett.add(n);
      return true;
    })
    .slice(0, MAKS_ATTERHALD);

  const malar = {};
  const brukteNoklar = new Set();
  const raaMalar = kjelde.malar && typeof kjelde.malar === 'object' ? kjelde.malar : {};
  Object.keys(raaMalar).slice(0, MAKS_MALAR).forEach((k) => {
    const m = raaMalar[k];
    if (!m || typeof m !== 'object') return;
    const namn = reintTekst(m.namn, 80);
    if (!namn) return;
    // Behald nøkkelen om han er gyldig - då overlever tidlegare tilbod som peikar på han.
    const nokkel = /^[a-z0-9][a-z0-9-]{0,39}$/.test(k) && !brukteNoklar.has(k)
      ? k
      : lagNokkel(namn, brukteNoklar);
    brukteNoklar.add(nokkel);
    malar[nokkel] = { namn, linjer: normaliserLinjer(m.linjer, MAKS_LINJER_PER_MAL) };
  });

  return {
    atterhald,
    felles: normaliserLinjer(kjelde.felles, MAKS_LINJER_PER_MAL),
    malar,
  };
}

// Det lagra oppsettet, med standarden som sikkerheitsnett per del. Slettar
// bedrifta alle malane sine, får dei standardmalane tilbake i staden for eit
// tomt verktøy.
function flettOppsett(lagra) {
  const std = standardOppsett();
  if (!lagra || typeof lagra !== 'object') return std;
  const reint = normaliserOppsett(lagra);
  return {
    atterhald: reint.atterhald.length ? reint.atterhald : std.atterhald,
    felles: Array.isArray(lagra.felles) ? reint.felles : std.felles,
    malar: Object.keys(reint.malar).length ? reint.malar : std.malar,
  };
}

// Alle linjene som skal liggje i veljaren for ein gitt jobbtype, i den
// rekkjefølgja dei blir viste: malen sine først, så fellslinjene.
function katalogFor(oppsett, jobbtype) {
  const o = oppsett || standardOppsett();
  const mal = o.malar && o.malar[jobbtype];
  return {
    malnamn: mal ? mal.namn : '',
    mallinjer: mal ? mal.linjer : [],
    felles: o.felles || [],
  };
}

/* ---------- reknestykke ---------- */

function reknUt(tilbod) {
  const linjer = Array.isArray(tilbod && tilbod.linjer) ? tilbod.linjer : [];
  const mvaSats = Number(tilbod && tilbod.mvaSats);
  const sats = Number.isFinite(mvaSats) ? mvaSats : MVA_SATS;

  let netto = 0;
  const utrekna = linjer.map((l) => {
    const mengd = Number(l.mengd) || 0;
    const pris = Number(l.einingspris) || 0;
    const sum = Math.round(mengd * pris);
    netto += sum;
    return Object.assign({}, l, { sum });
  });

  const mva = Math.round(netto * sats / 100);
  return { linjer: utrekna, netto, mva, sats, brutto: netto + mva };
}

/* ---------- prisbank ---------- */

function normaliser(tekst) {
  return String(tekst || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Kvar lagra varelinje oppdaterer prisbanken, slik at neste tilbod kan foreslå
// den prisen bedrifta faktisk brukte sist.
function oppdaterPrisbank(prisbank, linjer) {
  const bank = Array.isArray(prisbank) ? prisbank.slice() : [];
  (Array.isArray(linjer) ? linjer : []).forEach((l) => {
    const tekst = String(l.tekst || '').trim();
    const pris = Number(l.einingspris);
    if (!tekst || !Number.isFinite(pris) || pris <= 0) return;
    const nokkel = normaliser(tekst);
    const eksisterande = bank.find((b) => normaliser(b.tekst) === nokkel && b.eining === l.eining);
    if (eksisterande) {
      eksisterande.einingspris = pris;
      eksisterande.tal = (eksisterande.tal || 1) + 1;
      eksisterande.sist = new Date().toISOString();
    } else {
      bank.push({ tekst, eining: l.eining || 'stk', einingspris: pris, tal: 1, sist: new Date().toISOString() });
    }
  });
  // Hald banken på ein fornuftig storleik: dei mest brukte først
  bank.sort((a, b) => (b.tal || 0) - (a.tal || 0));
  return bank.slice(0, 300);
}

function prisFor(prisbank, tekst, eining) {
  const nokkel = normaliser(tekst);
  const treff = (prisbank || []).find((b) => normaliser(b.tekst) === nokkel && (!eining || b.eining === eining));
  return treff ? treff.einingspris : 0;
}

/* ---------- malar ---------- */

// Standardlinjene for jobbtypen. Berre dei som er merkte `standard` blir sette
// inn - resten ligg i veljaren og blir henta ved behov.
function lagFraaMal(jobbtype, prisbank, oppsett) {
  const o = oppsett || standardOppsett();
  const mal = o.malar && o.malar[jobbtype];
  if (!mal) return [];
  // Malen sine standardlinjer først, så dei fellslinjene som er merkte standard.
  return mal.linjer.concat(o.felles || [])
    .filter((l) => l.standard)
    .map((l) => ({
      tekst: l.tekst,
      eining: l.eining,
      mengd: 0,
      einingspris: prisFor(prisbank, l.tekst, l.eining),
    }));
}

/* ---------- KI-utkast ---------- */

const MODELL = process.env.AI_MODELL || 'claude-opus-5';

function kiTilgjengeleg() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Plukkar dei mest relevante tidlegare tilboda som døme. Vi tek berre med
// aksepterte og sende tilbod - avslåtte prisar er ikkje noko å lære av.
function liknandeTilbod(alle, jobbtype, maks) {
  return (alle || [])
    .filter((t) => t.jobb && t.jobb.type === jobbtype)
    .filter((t) => t.status === 'akseptert' || t.status === 'sendt')
    .sort((a, b) => {
      // Aksepterte først, deretter nyaste
      if (a.status !== b.status) return a.status === 'akseptert' ? -1 : 1;
      return String(b.oppdatert || '').localeCompare(String(a.oppdatert || ''));
    })
    .slice(0, maks || 5);
}

// Fjernar alt som kan identifisere kunden. Modellen treng omfanget og prisane,
// ikkje kven kunden var.
function anonymiser(t) {
  return {
    jobbtype: t.jobb && t.jobb.type,
    bygningstype: t.jobb && t.jobb.bygningstype,
    areal: t.jobb && t.jobb.areal,
    romtal: t.jobb && t.jobb.romtal,
    tilstand: t.jobb && t.jobb.tilstand,
    tilkomst: t.jobb && t.jobb.tilkomst,
    omfang: t.jobb && t.jobb.notat,
    utfall: t.status,
    linjer: (t.linjer || []).map((l) => ({
      tekst: l.tekst, eining: l.eining, mengd: l.mengd, einingspris: l.einingspris,
    })),
  };
}

const LINJESKJEMA = {
  type: 'object',
  properties: {
    linjer: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tekst: { type: 'string', description: 'Kort beskrivelse av arbeidet på norsk bokmål' },
          eining: { type: 'string', enum: EININGAR },
          mengd: { type: 'number', description: 'Antall enheter. 0 hvis den må måles på befaring.' },
          einingspris: { type: 'number', description: 'Pris per enhet i kroner eks. mva.' },
          begrunnelse: { type: 'string', description: 'Én kort setning om hvorfor mengden og prisen er satt slik.' },
        },
        required: ['tekst', 'eining', 'mengd', 'einingspris', 'begrunnelse'],
        additionalProperties: false,
      },
    },
    merknad: {
      type: 'string',
      description: 'Kort melding til maleren om hva som må sjekkes eller måles på befaring.',
    },
  },
  required: ['linjer', 'merknad'],
  additionalProperties: false,
};

const SYSTEMPROMPT = `Du hjelper Eid Malerservice AS i Nordfjordeid med å lage utkast til tilbud på malerarbeid.

Du får:
- beskrivelsen av jobben maleren har notert
- bedriftens egen linjekatalog for denne jobbtypen
- bedriftens egen prisbank (enhetspriser de faktisk har brukt)
- anonymiserte tidligere tilbud for samme type jobb, med utfall

Regler:
- Bruk bedriftens egne priser. Prisbanken og tidligere tilbud er fasit — ikke bransjegjennomsnitt og ikke priser du gjetter.
- Bruk linjetekstene fra bedriftens egen linjekatalog ordrett når en av dem passer. Da kjenner kunden igjen formuleringene, og prisbanken treffer. Lag bare en ny linjetekst når ingen i katalogen dekker arbeidet.
- Finnes det ingen pris for en linje, sett einingspris til 0 og forklar i begrunnelsen at prisen må fylles inn.
- Sett mengd til 0 der beskrivelsen ikke gir grunnlag for å regne den ut. Ikke gjett på areal.
- Alle priser er eks. mva.
- Skriv linjetekstene på norsk bokmål, kort og konkret, slik en kunde forstår hva han betaler for.
- Ta med rigg, materialer og rydding når jobbtypen tilsier det.
- Ikke lov noe om tidsbruk, garantier eller sertifiseringer.

Dette er et utkast. En fagperson går gjennom og retter før det sendes.`;

async function kiUtkast({ jobb, prisbank, tidlegare, oppsett }) {
  if (!kiTilgjengeleg()) {
    throw new Error('KI-utkast er ikkje slått på. Legg inn ANTHROPIC_API_KEY som miljøvariabel for å bruke det.');
  }
  const Anthropic = require('@anthropic-ai/sdk');
  const klient = new (Anthropic.default || Anthropic)();

  const doeme = liknandeTilbod(tidlegare, jobb.type, 5).map(anonymiser);
  const relevantPrisbank = (prisbank || []).slice(0, 80);
  const katalog = katalogFor(oppsett, jobb.type);
  const katalogLinjer = katalog.mallinjer.concat(katalog.felles)
    .map((l) => ({ tekst: l.tekst, eining: l.eining }));

  const brukartekst = [
    '## Jobben det skal gis tilbud på',
    JSON.stringify({
      jobbtype: jobb.type,
      bygningstype: jobb.bygningstype,
      areal: jobb.areal,
      romtal: jobb.romtal,
      tilstand: jobb.tilstand,
      tilkomst: jobb.tilkomst,
      beskrivelse: jobb.notat,
    }, null, 1),
    '',
    '## Bedriftens linjekatalog for denne jobbtypen (bruk disse tekstene ordrett når de passer)',
    katalogLinjer.length ? JSON.stringify(katalogLinjer, null, 1) : '(ingen katalog satt opp for denne jobbtypen)',
    '',
    '## Bedriftens prisbank (enhetspriser de har brukt før)',
    relevantPrisbank.length ? JSON.stringify(relevantPrisbank, null, 1) : '(tom — bedriften har ikke lagret priser ennå)',
    '',
    '## Tidligere tilbud for samme jobbtype (anonymisert)',
    doeme.length ? JSON.stringify(doeme, null, 1) : '(ingen tidligere tilbud av denne typen ennå)',
    '',
    'Lag et utkast til varelinjer for denne jobben.',
  ].join('\n');

  const svar = await klient.messages.create({
    model: MODELL,
    // Thinking er på som standard og deler max_tokens med svaret, så vi gir god plass.
    max_tokens: 8000,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: LINJESKJEMA },
    },
    system: SYSTEMPROMPT,
    messages: [{ role: 'user', content: brukartekst }],
  });

  if (svar.stop_reason === 'refusal') {
    throw new Error('Modellen ville ikkje svare på denne førespurnaden.');
  }

  const tekstblokk = (svar.content || []).find((b) => b.type === 'text');
  if (!tekstblokk) throw new Error('Fekk ikkje noko svar frå modellen.');

  let data;
  try {
    data = JSON.parse(tekstblokk.text);
  } catch (e) {
    throw new Error('Klarte ikkje tolke svaret frå modellen.');
  }

  return {
    linjer: (data.linjer || []).map((l) => ({
      tekst: String(l.tekst || '').slice(0, 200),
      eining: EININGAR.includes(l.eining) ? l.eining : 'stk',
      mengd: Number(l.mengd) || 0,
      einingspris: Number(l.einingspris) || 0,
      begrunnelse: String(l.begrunnelse || '').slice(0, 300),
    })),
    merknad: String(data.merknad || '').slice(0, 1000),
    modell: svar.model,
    brukteDoeme: doeme.length,
    forbruk: svar.usage,
  };
}

/* ---------- eksport for seinare KI-trening ---------- */

// Eitt tilbod per linje (JSONL), utan kundeopplysningar. Formatet er valt fordi
// det er det vanlege inngangsformatet for både finjustering og for å byggje
// eit søkbart døme-arkiv.
function kiEksport(alle) {
  return (alle || [])
    .filter((t) => t.status === 'akseptert' || t.status === 'avslatt')
    .map((t) => JSON.stringify({
      jobb: {
        type: t.jobb && t.jobb.type,
        bygningstype: t.jobb && t.jobb.bygningstype,
        areal: t.jobb && t.jobb.areal,
        romtal: t.jobb && t.jobb.romtal,
        tilstand: t.jobb && t.jobb.tilstand,
        tilkomst: t.jobb && t.jobb.tilkomst,
        beskrivelse: t.jobb && t.jobb.notat,
      },
      linjer: (t.linjer || []).map((l) => ({
        tekst: l.tekst, eining: l.eining, mengd: l.mengd, einingspris: l.einingspris,
      })),
      sum: reknUt(t).netto,
      utfall: t.status,
      grunn: t.utfall && t.utfall.grunn,
    }))
    .join('\n');
}

module.exports = {
  MVA_SATS, STANDARD_ATTERHALD, FELLESLINJER, MALAR, EININGAR,
  standardOppsett, normaliserOppsett, flettOppsett, katalogFor,
  reknUt, oppdaterPrisbank, prisFor, lagFraaMal,
  kiTilgjengeleg, kiUtkast, kiEksport, MODELL,
};
