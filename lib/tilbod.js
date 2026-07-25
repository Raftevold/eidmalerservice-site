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

// Standard atterhald etter vanleg norsk handverkarskikk. Blir lagt inn i nye
// tilbod og kan endrast per tilbod.
const STANDARD_ATTERHALD = [
  'Prisen forutsetter at arbeidsstedet er ryddet og tilgjengelig når vi starter.',
  'Skjulte skader (råte, fukt, sopp) som først viser seg under arbeidet er ikke med i prisen. Vi varsler før vi utfører slikt arbeid.',
  'Dersom underlaget krever flere strøk enn forutsatt, avtales dette før arbeidet fortsetter.',
  'Prisen gjelder i 30 dager fra tilbudsdato.',
  'Strøm og vann på arbeidsstedet stilles til disposisjon av kunden.',
];

// Malar per jobbtype. Mengdene er tomme - dei kjem frå befaringa.
// Einingsprisane blir henta frå prisbanken når bedrifta har lagra liknande linjer.
const MALAR = {
  innvendig: {
    namn: 'Innvendig maling',
    linjer: [
      { tekst: 'Tildekking og klargjøring av rom', eining: 'time' },
      { tekst: 'Sparkling og sliping av vegger', eining: 'm2' },
      { tekst: 'Grunning av vegger', eining: 'm2' },
      { tekst: 'To strøk maling på vegger', eining: 'm2' },
      { tekst: 'Maling av tak', eining: 'm2' },
      { tekst: 'Maling av listverk og karmer', eining: 'lm' },
      { tekst: 'Materialer (maling, sparkel, forbruk)', eining: 'stk' },
      { tekst: 'Rydding og bortkjøring av avfall', eining: 'stk' },
    ],
  },
  utvendig: {
    namn: 'Utvendig maling',
    linjer: [
      { tekst: 'Rigg, stillas og tildekking', eining: 'stk' },
      { tekst: 'Vask av fasade', eining: 'm2' },
      { tekst: 'Skraping og fjerning av løs maling', eining: 'm2' },
      { tekst: 'Grunning av bart treverk', eining: 'm2' },
      { tekst: 'To strøk maling på kledning', eining: 'm2' },
      { tekst: 'Maling av vindskier, vindu og dører', eining: 'lm' },
      { tekst: 'Materialer (maling, grunning, forbruk)', eining: 'stk' },
      { tekst: 'Nedrigg og rydding', eining: 'stk' },
    ],
  },
  tapetsering: {
    namn: 'Tapetsering',
    linjer: [
      { tekst: 'Tildekking og klargjøring', eining: 'time' },
      { tekst: 'Sparkling og sliping av underlag', eining: 'm2' },
      { tekst: 'Grunning før tapet', eining: 'm2' },
      { tekst: 'Oppsetting av tapet', eining: 'm2' },
      { tekst: 'Materialer utenom tapet (lim, grunning)', eining: 'stk' },
      { tekst: 'Rydding', eining: 'stk' },
    ],
  },
  gulvlegging: {
    namn: 'Gulvlegging',
    linjer: [
      { tekst: 'Riving av eksisterende gulvbelegg', eining: 'm2' },
      { tekst: 'Avretting og klargjøring av underlag', eining: 'm2' },
      { tekst: 'Legging av belegg', eining: 'm2' },
      { tekst: 'Sveising av skjøter', eining: 'lm' },
      { tekst: 'Oppbrett mot vegg og listverk', eining: 'lm' },
      { tekst: 'Materialer (lim, sveisetråd, forbruk)', eining: 'stk' },
      { tekst: 'Rydding og bortkjøring', eining: 'stk' },
    ],
  },
  flislegging: {
    namn: 'Flislegging',
    linjer: [
      { tekst: 'Klargjøring og oppmåling av underlag', eining: 'm2' },
      { tekst: 'Membran på våtrom', eining: 'm2' },
      { tekst: 'Legging av flis på gulv', eining: 'm2' },
      { tekst: 'Legging av flis på vegg', eining: 'm2' },
      { tekst: 'Fuging', eining: 'm2' },
      { tekst: 'Materialer utenom flis (lim, fugemasse, membran)', eining: 'stk' },
      { tekst: 'Rydding', eining: 'stk' },
    ],
  },
  industribelegg: {
    namn: 'Industribelegg',
    linjer: [
      { tekst: 'Sliping og klargjøring av betongunderlag', eining: 'm2' },
      { tekst: 'Primer', eining: 'm2' },
      { tekst: 'Utlegging av industribelegg', eining: 'm2' },
      { tekst: 'Oppbrett og hulkil', eining: 'lm' },
      { tekst: 'Materialer', eining: 'stk' },
      { tekst: 'Rigg og rydding', eining: 'stk' },
    ],
  },
};

const EININGAR = ['m2', 'lm', 'time', 'stk', 'dag'];

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

function lagFraaMal(jobbtype, prisbank) {
  const mal = MALAR[jobbtype];
  if (!mal) return [];
  return mal.linjer.map((l) => ({
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
- bedriftens egen prisbank (enhetspriser de faktisk har brukt)
- anonymiserte tidligere tilbud for samme type jobb, med utfall

Regler:
- Bruk bedriftens egne priser. Prisbanken og tidligere tilbud er fasit — ikke bransjegjennomsnitt og ikke priser du gjetter.
- Finnes det ingen pris for en linje, sett einingspris til 0 og forklar i begrunnelsen at prisen må fylles inn.
- Sett mengd til 0 der beskrivelsen ikke gir grunnlag for å regne den ut. Ikke gjett på areal.
- Alle priser er eks. mva.
- Skriv linjetekstene på norsk bokmål, kort og konkret, slik en kunde forstår hva han betaler for.
- Ta med rigg, materialer og rydding når jobbtypen tilsier det.
- Ikke lov noe om tidsbruk, garantier eller sertifiseringer.

Dette er et utkast. En fagperson går gjennom og retter før det sendes.`;

async function kiUtkast({ jobb, prisbank, tidlegare }) {
  if (!kiTilgjengeleg()) {
    throw new Error('KI-utkast er ikkje slått på. Legg inn ANTHROPIC_API_KEY som miljøvariabel for å bruke det.');
  }
  const Anthropic = require('@anthropic-ai/sdk');
  const klient = new (Anthropic.default || Anthropic)();

  const doeme = liknandeTilbod(tidlegare, jobb.type, 5).map(anonymiser);
  const relevantPrisbank = (prisbank || []).slice(0, 80);

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
  MVA_SATS, STANDARD_ATTERHALD, MALAR, EININGAR,
  reknUt, oppdaterPrisbank, prisFor, lagFraaMal,
  kiTilgjengeleg, kiUtkast, kiEksport, MODELL,
};
