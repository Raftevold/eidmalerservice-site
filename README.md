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
