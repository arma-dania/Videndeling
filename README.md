# Videndeling — fra Claude-artifact til Teams-fane

Dette projekt er et skelet, der gør det muligt at hoste jeres videndelings-side
selv, med de originale AI-funktioner (kategorisering, opsummering, semantisk
søgning) i behold, og en fælles database alle kolleger deler.

## Hvorfor et skelet og ikke bare den originale kode?

Artifact-versionen brugte to ting, der kun findes inde i Claude:

- Et indbygget, nøglefrit AI-kald (den bagvedliggende Claude-app leverer selv
  en API-nøgle).
- `window.storage` — en fælles lagring, der kun eksisterer, mens siden vises
  inde i en Claude-samtale.

Uden for Claude skal begge dele erstattes af noget, I selv ejer og hoster.
Det er det, filerne i `netlify/functions/` gør — de har nøjagtig samme
"facon" (samme funktionsnavne og parametre), så jeres eksisterende
komponent-kode kan genbruges næsten uændret.

## Trin 1 — Skaf en Anthropic API-nøgle

1. Gå til [console.anthropic.com](https://console.anthropic.com).
2. Opret en organisationskonto, hvis I ikke har en.
3. Gå til **API Keys** → **Create Key**.
4. Gem nøglen et sikkert sted — den vises kun én gang, og den må aldrig
   lægges ind i selve koden eller på GitHub.

## Trin 2 — Læg projektet på GitHub

1. Opret en gratis konto på [github.com](https://github.com), hvis I ikke
   har en.
2. Opret et nyt, tomt repository, fx `vidensdeling`.
3. Upload alle filerne i dette projekt til repositoryet (via GitHubs
   "Upload files" i browseren, eller `git push`, hvis I bruger Git).

## Trin 3 — Indsæt jeres eksisterende side

1. Åbn `src/App.jsx`.
2. Kopiér jeres komponent-kode fra den oprindelige `vidensdeling.jsx`
   (den I fik som artifact) ind under kommentaren
   `👉 HERFRA: indsæt jeres eksisterende vidensdeling-komponent`.
3. Erstat alle forekomster af `window.storage.` med `storage.` (uden
   `window.`-delen). Funktionerne `get`, `set`, `delete` og `list` hedder
   det samme, så resten af koden kan stå urørt.
4. `spørgClaude(...)` kan blive stående som den er — den peger nu
   automatisk på jeres egen funktion.

## Trin 4 — Opret Netlify-konto og forbind repositoryet

1. Gå til [netlify.com](https://netlify.com) og opret en gratis konto
   (kan oprettes direkte med jeres GitHub-login).
2. Vælg **Add new site → Import an existing project**.
3. Vælg GitHub, og pег på det repository, I lige har oprettet.
4. Netlify genkender automatisk build-kommandoen (`npm run build`) og
   output-mappen (`dist`) fra `netlify.toml` — I skal ikke rette noget.
5. Klik **Deploy**.

## Trin 5 — Tilføj API-nøglen som miljøvariabel

1. I jeres nye Netlify-site: **Site configuration → Environment variables**.
2. Tilføj en ny variabel:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** nøglen fra Trin 1
3. Gå til **Deploys** og vælg **Trigger deploy → Deploy site**, så
   ændringen slår igennem.

## Trin 6 — Test siden

1. Åbn URL'en, Netlify har givet jer (noget i stil med
   `https://jeres-navn.netlify.app`).
2. Prøv at oprette et opslag, og bekræft at AI-kategorisering og -søgning
   virker, samt at opslag stadig er der, hvis I genindlæser siden.
3. Valgfrit: under **Domain settings** kan I ændre til et mere sigende
   navn, eller pege jeres eget domæne på siden.

## Trin 7 — Tilføj som fane i Teams

Når URL'en virker:

1. Åbn den ønskede kanal i Teams.
2. Klik **+** ud for fanerne øverst.
3. Vælg appen **Website** (eller **Websted**).
4. Indsæt jeres Netlify-URL.
5. Navngiv fanen, fx "Videndeling", og klik **Tilføj**.

Netlify sætter ikke restriktive headers på siden, så den kan vises i en
iframe uden yderligere opsætning — I skal blot undgå selv at tilføje en
`X-Frame-Options`- eller CSP-header, der blokerer det.

## Løbende drift

- Enhver ændring, I committer til GitHub-repositoryet, bygges og udgives
  automatisk af Netlify.
- Netlify Blobs (databasen) og de to funktioner er inkluderet i Netlifys
  gratis niveau ved almindeligt brug i et internt team.
- Overvåg jeres API-forbrug på console.anthropic.com, hvis brugen vokser
  markant.
