# Eid Malerservice AS – nettside (demo)

Nettside med innebygd admin/CMS for Eid Malerservice AS (org.nr. 924 718 536), Øyane 8, 6770 Nordfjordeid.

## Teknologi

- **Node.js + Express + EJS** – server-rendra sider utan byggjesteg. Rask oppstart, lite minne, enkel å drifte på Render gratisplan.
- **Persistens:** Alt redigerbart innhald (tekstar, bilete, meldingar) blir lagra som filer i `data`-greina i dette repoet via GitHub API. Render sitt flyktige filsystem er difor ikkje eit problem – innhaldet overlever omstart og redeploy. Koden bur på `main`; `data`-greina blir aldri deployert.
- **Bilete:** `sharp` skalerer og komprimerer alle opplasta bilete til webp automatisk (maks 1600 px brei).
- **Ingen informasjonskapslar** på den opne delen av sida. Berre éin nødvendig, signert innloggings-cookie i admin.
- **Streng CSP** utan `unsafe-inline`: ingen inline-skript eller -stilar. Fargane i fargeveljaren blir serverte som eit generert stilark på `/css/innhald.css`.

## Design

Formspråket er henta frå bedrifta sin eigen logo – eit art nouveau-ordmerke i kvitt med ornament over og under. Sida byggjer på same palett: djup varm svart, kritkvit tekst og messing/gull som aksentfarge. Ornamentet frå logoen er trekt ut som eige element og brukt som seksjonsskilje.

Animasjonane rører berre `transform` og `opacity`, slik at dei ikkje utløyser omrekning av layout. Alt er slått av under `prefers-reduced-motion: reduce`, og eit `<noscript>`-stilark sørgjer for at alt innhald er synleg sjølv om JavaScript ikkje køyrer.

## Tilbodsverktøy

Admin har ei eiga fane «Tilbud» der bedrifta kan lage tilbod til kundar på tre måtar:

1. **Tomt tilbod** – blanke varelinjer ein fyller ut sjølv.
2. **Frå mal** – standardlinjer for jobbtypen (innvendig, utvendig, tapetsering,
   gulvlegging, flislegging, industribelegg), med einingsprisar henta frå prisbanken.
3. **Utkast med KI** – ein språkmodell foreslår varelinjer ut frå omfanget.

Uansett metode er det mennesket som godkjenner. Tilbodet blir rekna ut med MVA og
kan skrivast ut som PDF frå nettlesaren i bedrifta sin eigen profil.

**Prisbanken** veks for kvar lagra varelinje: neste gong same arbeidet dukkar opp,
er prisen bedrifta faktisk brukte allereie fylt inn. Tilboda får status
kladd → sendt → akseptert/avslått, og ved avslag kan ein registrere grunnen.

### KI-utkastet

Slått av som standard. Set miljøvariabelen `ANTHROPIC_API_KEY` for å aktivere det.
Utan nøkkel fungerer dei to andre metodane som normalt, og KI-valet er gråa ut
med ei forklaring.

Modellen får tre ting: omfanget maleren har notert, bedrifta sin eigen prisbank,
og opptil fem tidlegare tilbod av same jobbtype. **Kundeopplysningar blir aldri
sende** – dei tidlegare tilboda blir anonymiserte til jobbtype, omfang, varelinjer
og utfall. Berre aksepterte og sende tilbod blir brukte som døme; avslåtte prisar
er ikkje noko å lære av.

Modellen er `claude-opus-5`. Sett `AI_MODELL=claude-sonnet-5` for ein rimelegare
variant som truleg held godt nok for denne oppgåva.

**Datagrunnlag for seinare:** kvart tilbod blir lagra strukturert i `tilbod.json`.
Knappen «Last ned datagrunnlag (JSONL)» gir eit pseudonymisert datasett med
jobbtype, omfang, varelinjer, sum og utfall – formatet ein treng for å seinare
finjustere ein modell eller byggje eit søkbart dømearkiv.

## Miljøvariablar

| Namn | Forklaring |
| --- | --- |
| `GITHUB_TOKEN` | Token med `repo`-tilgang, brukt til å lese/skrive `data`-greina |
| `GH_OWNER` | GitHub-brukar/organisasjon (standard `Raftevold`) |
| `GH_REPO` | Repo-namn (standard `eidmalerservice-site`) |
| `GH_DATA_BRANCH` | Datagrein (standard `data`) |
| `ADMIN_PASSWORD_HASH` | SHA-256-hash (hex) av admin-passordet |
| `SESSION_SECRET` | Tilfeldig streng for signering av innloggings-cookien |
| `BASE_URL` | Full adresse til sida, t.d. `https://…onrender.com` |
| `DEMO_NOINDEX` | `1` (standard) = noindex på alle sider. Sett til `0` ved lansering. |
| `ANTHROPIC_API_KEY` | Valfri. Slår på KI-utkast i tilbodsverktøyet. |
| `AI_MODELL` | Valfri. Standard `claude-opus-5`. |

Utan `GITHUB_TOKEN` køyrer serveren i lokal modus og lagrar i `data-local/` (ikkje sjekka inn).

## Lokal køyring

```bash
npm install
npm start
```

## Bilete

Råbileta ligg i `../research/bilder` og blir prosesserte med:

```bash
npm run prep-images
```

## Lansering (når bedrifta har godkjent)

1. Sett `DEMO_NOINDEX=0` på Render. Då opnar `robots.txt` for indeksering, `noindex`-metataggen forsvinn, og `sitemap.xml` blir annonsert i robots.txt.
2. Peik domenet mot Render (custom domain) og oppdater `BASE_URL`.
3. Opprett ei Google-bedriftsprofil for verksemda – ho manglar heilt i dag.
