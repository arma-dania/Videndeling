import React, { useState, useEffect, useRef } from "react";
import { storage, adgangshoveder, gemKode, hentKode } from "./lager.js";
/* ------------------------------------------------------------------ */
/*  Data og konstanter                                                 */
/* ------------------------------------------------------------------ */

/* Nøglen, hele kataloget lå under i første version — se flytGammeltKatalog() */
const NOEGLE_GAMMEL = "vidensdeling:v1";

const FAGOMRAADER = [
  { navn: "Markedsføring", farve: "#cb142a" },
  { navn: "Økonomi", farve: "#1B5E5A" },
  { navn: "Organisation", farve: "#5B4B8A" },
  { navn: "Kommunikation", farve: "#A8621B" },
  { navn: "Jura", farve: "#33415C" },
  { navn: "Didaktik", farve: "#5E6E28" },
  { navn: "Teknologi", farve: "#2E6E8E" },
];

const FAGLISTE = FAGOMRAADER.map((f) => f.navn).join(", ");

const TYPER = ["Dokument", "Præsentation", "Podcast", "Video"];

/* Link til kanalens "Videndeling"-mappe i Teams. Sættes i Netlify som
   miljøvariablen VITE_TEAMS_MAPPE; uden den vises vejledningen uden link. */
const TEAMS_MAPPE = import.meta.env.VITE_TEAMS_MAPPE || "";

/* Startliste — nye navne kan tilføjes i appen */
const STANDARDNAVNE = [
  "Allan",
  "Arne",
  "Helle",
  "Karen Marie",
  "Lana",
  "Laurids",
  "Mariann",
  "Pernille",
  "Torben",
  "Vash",
];

const EKSEMPELSOEG = [
  "noget om prissætning jeg kan bruge på 2. semester",
  "hvordan får jeg de stille studerende med i gruppearbejdet",
  "opdatering om markedsføringsloven",
];

const farveFor = (kat) =>
  (FAGOMRAADER.find((f) => f.navn === kat) || { farve: "#6E6369" }).farve;

/* ------------------------------------------------------------------ */
/*  Hjælpefunktioner                                                   */
/* ------------------------------------------------------------------ */

const idag = () => new Date().toISOString().slice(0, 10);

const visDato = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
};

function gætType(url) {
  const u = (url || "").toLowerCase();
  const format = filformat(url);
  if (format === "PowerPoint") return "Præsentation";
  if (format === "Video") return "Video";
  if (/youtube|youtu\.be|vimeo|\.mp4|video/.test(u)) return "Video";
  if (/spotify|podcast|soundcloud|apple\.com\/.*podcast|\.mp3|anchor\.fm/.test(u))
    return "Podcast";
  return "Dokument";
}

/* Kun almindelige webadresser må gemmes og vises som link — ellers kunne et
   "javascript:"-link køre kode hos den kollega, der klikker på det */
function erWebadresse(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/* "www.dr.dk" bliver til "https://www.dr.dk"; alt andet røres ikke */
function normaliserUrl(url) {
  const u = (url || "").trim();
  return u && !/^[a-z][a-z0-9+.-]*:/i.test(u) ? `https://${u}` : u;
}

const URLFEJL = "Linket skal være en webadresse, der begynder med https:// eller http://.";

function pænUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* Links til filer i Teams, SharePoint og OneDrive */
const ER_M365 = /sharepoint\.com|teams\.microsoft\.com|onedrive\.live\.com|1drv\.ms/i;

/* SharePoints delingslinks fortæller filtypen med et bogstav: /:p:/ er en
   PowerPoint, /:v:/ en video osv. Ellers bruges filendelsen. */
const DELINGSKODER = { w: "Word", x: "Excel", p: "PowerPoint", b: "PDF", v: "Video", f: "Mappe", i: "Billede" };
const ENDELSER = {
  pptx: "PowerPoint", ppt: "PowerPoint", docx: "Word", doc: "Word", xlsx: "Excel",
  pdf: "PDF", mp4: "Video", mov: "Video", m4v: "Video", mp3: "Lyd", m4a: "Lyd",
};

function filformat(url) {
  const u = url || "";
  const kode = u.match(/\/:([a-z]):\//i);
  if (kode && ER_M365.test(u)) return DELINGSKODER[kode[1].toLowerCase()] || "";
  const endelse = u.split(/[?#]/)[0].match(/\.([a-z0-9]{2,4})$/i);
  return endelse ? ENDELSER[endelse[1].toLowerCase()] || "" : "";
}

/* Teksten på kortets knap, fx "Åbn PowerPoint i Teams" */
function åbnTekst(url) {
  const format = filformat(url);
  const navn = { Video: "videoen", Mappe: "mappen", Billede: "billedet", Lyd: "lydfilen" }[format] || format;
  if (ER_M365.test(url)) return navn ? `Åbn ${navn} i Teams` : "Åbn i Teams";
  return navn ? `Åbn ${navn}` : "Åbn";
}

/* Teksten på en links knap: linkets eget navn, hvis det har et, ellers filtypen */
function knapTekst(link) {
  if (!link.navn) return åbnTekst(link.url);
  return `Åbn ${link.navn}${ER_M365.test(link.url) ? " i Teams" : ""}`;
}

/* Et opslag kan have flere links, fx slides og optagelse. De ligger i
   "links"; "url" er altid det første, så ældre opslag og søgning virker. */
const linksFor = (post) =>
  Array.isArray(post.links) && post.links.length
    ? post.links
    : post.url
    ? [{ url: post.url, navn: "" }]
    : [];

/* Renser links fra en formular. Tomme rækker springes over. */
function rensLinks(rækker) {
  const links = rækker
    .map((r) => ({ url: normaliserUrl(r.url), navn: (r.navn || "").trim() }))
    .filter((r) => r.url);
  if (links.length === 0) return { fejl: "Indsæt mindst ét link til det, du vil dele." };
  if (links.some((r) => !erWebadresse(r.url))) return { fejl: URLFEJL };
  return { links };
}

/* Links bag et login kan AI'en ikke åbne — så skal filen vedhæftes i stedet */
const BAG_LOGIN = /sharepoint|onedrive|teams\.microsoft|itslearning|moodle|canvas|wiseflow|intranet|docs\.google|drive\.google/i;

const ER_YOUTUBE = /(?:youtube\.com\/(?:watch|shorts|live)|youtu\.be\/)/i;

/* YouTubes oEmbed er offentligt og kræver ingen nøgle — giver rigtig titel og kanal */
async function hentYouTubeInfo(url) {
  if (!ER_YOUTUBE.test(url)) return null;
  try {
    const svar = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!svar.ok) return null;
    const d = await svar.json();
    return d && d.title ? { titel: d.title, kanal: d.author_name || "" } : null;
  } catch {
    return null;
  }
}

/* Henter en offentlig side via Netlify-funktionen. Findes funktionen ikke
   — fx når appen køres som artifact — returneres null, og alt virker som før. */
async function hentSideTekst(url) {
  try {
    const svar = await fetch(
      `/.netlify/functions/hent-side?url=${encodeURIComponent(url)}`,
      { headers: adgangshoveder() }
    );
    if (!svar.ok) return null;
    const d = await svar.json();
    return d && d.tekst && d.tekst.length > 200 ? d : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Læsning af vedhæftede filer                                        */
/* ------------------------------------------------------------------ */

/* En Netlify-funktion tager højst ca. 6 MB ind og skal svare inden for 30
   sekunder. PDF'er, PowerPoint- og Word-filer læses derfor her i browseren,
   og kun teksten sendes videre. Filen selv gemmes ingen steder — den bliver
   i Teams. */
const MAKS_DIREKTE = 3.5 * 1024 * 1024;
// Ca. 30.000 ord i alt — nok til en hel konference, og AI'en når at læse det
const MAKS_SAMLET = 120000;
const MAKS_SIDE = 10000; // tekst fra én webside
const MAKS_INDSAT = 30000; // tekst, kollegaen selv har indsat

const ER_PPTX = /\.pptx$/i;
const ER_DOCX = /\.docx$/i;

/* Tekst fra Office-XML: hvert afsnit (<a:p> / <w:p>) bliver én linje */
function tekstFraXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagNameNS("*", "p")]
    .map((p) =>
      [...p.getElementsByTagNameNS("*", "t")].map((t) => t.textContent).join("")
    )
    .filter((linje) => linje.trim())
    .join("\n");
}

/* Samler dele (dias eller sider) under et loft. Er der for meget, forkortes
   hver del lige meget i stedet for at skære slutningen af — ellers ville de
   sidste oplæg i en lang præsentation aldrig komme med. Korte dele beholdes
   hele og giver deres overskud videre til de lange. */
function tilpas(dele, loft) {
  const samlet = dele.reduce((sum, d) => sum + d.length, 0);
  if (samlet <= loft) return dele.join("\n\n");
  const plads = [];
  let rest = loft;
  let tilbage = dele.length;
  for (const [længde, i] of dele.map((d, i) => [d.length, i]).sort((a, b) => a[0] - b[0])) {
    plads[i] = Math.min(længde, Math.floor(rest / tilbage));
    rest -= plads[i];
    tilbage--;
  }
  return dele.map((d, i) => (d.length > plads[i] ? `${d.slice(0, plads[i])}…` : d)).join("\n\n");
}

async function udtrækOffice(fil, loft) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(fil);
  const læs = (navn) => (zip.file(navn) ? zip.file(navn).async("string") : "");

  if (ER_DOCX.test(fil.name)) {
    return tilpas([tekstFraXml(await læs("word/document.xml"))], loft);
  }

  // PowerPoint: diasene i rækkefølge, med talernoter hvor de findes
  const nr = (navn) => Number((navn.match(/(\d+)\.xml$/) || [])[1] || 0);
  const dias = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => nr(a) - nr(b));
  const dele = [];
  for (const [i, navn] of dias.entries()) {
    const tekst = tekstFraXml(await læs(navn));
    const rel = await læs(navn.replace("slides/", "slides/_rels/") + ".rels");
    const note = rel.match(/notesSlides\/(notesSlide\d+\.xml)/);
    const noter = note ? tekstFraXml(await læs(`ppt/notesSlides/${note[1]}`)) : "";
    if (tekst || noter) {
      dele.push(`Dias ${i + 1}:\n${tekst}${noter ? `\nNoter: ${noter}` : ""}`);
    }
  }
  return tilpas(dele, loft);
}

async function udtrækPdf(fil, loft) {
  const pdfjs = await import("pdfjs-dist");
  const { default: arbejder } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = arbejder;
  const pdf = await pdfjs.getDocument({ data: await fil.arrayBuffer() }).promise;
  const dele = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const indhold = await (await pdf.getPage(i)).getTextContent();
    const tekst = indhold.items
      .map((x) => x.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (tekst) dele.push(`Side ${i}: ${tekst}`);
  }
  return tilpas(dele, loft);
}

/* Svarer enten { tekst } (udtrukket her) eller { blok } (sendes som fil til AI'en).
   "plads" er, hvor meget der er tilbage af de ca. 3,5 MB, der kan sendes som
   fil, og "loft" er, hvor mange tegn teksten fra denne fil må fylde. */
async function læsFil(fil, plads, loft) {
  if (ER_PPTX.test(fil.name) || ER_DOCX.test(fil.name)) {
    return { tekst: await udtrækOffice(fil, loft) };
  }
  if (fil.type === "application/pdf") {
    // Teksten er hurtigere og billigere for AI'en end selve PDF'en. Kun en
    // scannet PDF uden tekst sendes som fil, så AI'en kan se siderne.
    const tekst = await udtrækPdf(fil, loft);
    if (tekst.length > 200 || fil.size > plads) return { tekst };
    const data = await læsSomBase64(fil);
    return { blok: { type: "document", source: { type: "base64", media_type: fil.type, data } } };
  }
  if (fil.size > plads) {
    throw new Error(`Billedet ${fil.name} er for stort. Tag et skærmbillede i lavere opløsning.`);
  }
  const data = await læsSomBase64(fil);
  return { blok: { type: "image", source: { type: "base64", media_type: fil.type, data } } };
}

function læsSomBase64(fil) {
  return new Promise((klar, fejl) => {
    const læser = new FileReader();
    læser.onload = () => klar(String(læser.result).split(",")[1]);
    læser.onerror = () => fejl(new Error("Filen kunne ikke læses"));
    læser.readAsDataURL(fil);
  });
}

function udtrækJson(tekst) {
  if (!tekst) return null;
  const rent = tekst.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = Math.min(
    ...[rent.indexOf("{"), rent.indexOf("[")].filter((i) => i >= 0)
  );
  const slut = Math.max(rent.lastIndexOf("}"), rent.lastIndexOf("]"));
  if (!isFinite(start) || slut < 0) return null;
  try {
    return JSON.parse(rent.slice(start, slut + 1));
  } catch {
    return null;
  }
}

async function spørgClaude(indhold, brugWebsøgning) {
  // Model og svarlængde bestemmes af serveren (netlify/functions/ai.mjs)
  const body = { messages: [{ role: "user", content: indhold }] };
  if (brugWebsøgning) {
    body.tools = [{ type: "web_search", name: "web_search" }];
  }
  const svar = await fetch("/.netlify/functions/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adgangshoveder() },
    body: JSON.stringify(body),
  });
  const data = await svar.json().catch(() => null);
  if (!svar.ok) {
    // Gem serverens egen forklaring, fx at API-nøglen mangler, så den kan vises
    const fejl = new Error(`AI-fejl ${svar.status}`);
    fejl.detalje =
      (data && (data.fejl || (data.error && data.error.message))) ||
      (svar.status === 502 || svar.status === 504
        ? "AI'en nåede ikke at blive færdig inden for tidsgrænsen på 30 sekunder. Prøv igen, eller vedhæft færre filer"
        : `status ${svar.status}`);
    throw fejl;
  }
  if (!data || !Array.isArray(data.content)) throw new Error("Uventet svar");
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

const medDetalje = (tekst, e) =>
  e && e.detalje ? `${tekst} (Besked fra serveren: ${e.detalje})` : tekst;

/* ------------------------------------------------------------------ */
/*  Delt lagring                                                       */
/* ------------------------------------------------------------------ */

/* Hvert opslag ligger under sin egen nøgle, så to kolleger, der gemmer
   samtidig, ikke overskriver hinandens ændringer. Slettede opslag får
   feltet "slettet" i stedet for at blive fjernet, så de kan gendannes. */
const PRAEFIKS_OPSLAG = "vidensdeling:opslag:";
const NOEGLE_NAVNE = "vidensdeling:navne";

function læsJson(tekst) {
  try {
    return JSON.parse(tekst);
  } catch {
    return null;
  }
}

async function hentNøgle(noegle) {
  try {
    return læsJson((await storage.get(noegle)).value);
  } catch (e) {
    if (e.fandtesIkke) return null;
    throw e;
  }
}

/* Første version gemte hele kataloget under én nøgle. Findes den stadig,
   flyttes opslagene over i hver sin nøgle, og den gamle værdi gemmes som
   sikkerhedskopi under "vidensdeling:kopi:…", før den fjernes. */
async function flytGammeltKatalog() {
  const gammel = await hentNøgle(NOEGLE_GAMMEL);
  if (!gammel) return;
  const findes = new Set((await storage.list(PRAEFIKS_OPSLAG)).keys);
  await Promise.all(
    (gammel.opslag || [])
      .filter((p) => p && p.id && !findes.has(PRAEFIKS_OPSLAG + p.id))
      .map((p) => storage.set(PRAEFIKS_OPSLAG + p.id, JSON.stringify(p)))
  );
  if (Array.isArray(gammel.navne) && gammel.navne.length) {
    const navne = (await hentNøgle(NOEGLE_NAVNE)) || [];
    const alle = [...new Set([...navne, ...gammel.navne])].sort((a, b) =>
      a.localeCompare(b, "da")
    );
    await storage.set(NOEGLE_NAVNE, JSON.stringify(alle));
  }
  await storage.set(`vidensdeling:kopi:v1:${Date.now()}`, JSON.stringify(gammel));
  await storage.delete(NOEGLE_GAMMEL);
}

/* En lagerfejl kastes videre, så den kan vises — den må aldrig tolkes som
   et tomt katalog */
async function hentData() {
  await flytGammeltKatalog();
  const [alle, navne] = await Promise.all([
    storage.hentAlle(PRAEFIKS_OPSLAG),
    hentNøgle(NOEGLE_NAVNE),
  ]);
  return {
    opslag: Object.values(alle)
      .map(læsJson)
      .filter((p) => p && p.id),
    navne: Array.isArray(navne) && navne.length ? navne : STANDARDNAVNE,
  };
}

const gemOpslag = (post) => storage.set(PRAEFIKS_OPSLAG + post.id, JSON.stringify(post));

async function gemNavn(navn) {
  const navne = (await hentNøgle(NOEGLE_NAVNE)) || STANDARDNAVNE;
  const næste = navne.includes(navn)
    ? navne
    : [...navne, navn].sort((a, b) => a.localeCompare(b, "da"));
  await storage.set(NOEGLE_NAVNE, JSON.stringify(næste));
  return næste;
}

/* Browseren husker, hvem man er, så navnet er valgt på forhånd næste gang */
const MIT_NAVN = "vidensdeling:mitnavn";

function hentMitNavn() {
  try {
    return localStorage.getItem(MIT_NAVN) || "";
  } catch {
    return "";
  }
}

function gemMitNavn(navn) {
  try {
    localStorage.setItem(MIT_NAVN, navn);
  } catch {
    /* privat vindue o.l. */
  }
}

/* Den AI-baserede søgning får hele kataloget med. Bliver det meget stort,
   sendes kun de opslag, der deler flest ord med behovet */
const MAKS_I_SØGNING = 150;

function forfiltrer(q, opslag) {
  if (opslag.length <= MAKS_I_SØGNING) return opslag;
  const ord = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const point = (p) => {
    const t = `${p.titel} ${p.opsummering} ${p.kategori} ${p.navn}`.toLowerCase();
    return ord.reduce((sum, w) => sum + (t.includes(w) ? 1 : 0), 0);
  };
  return opslag
    .map((p) => [point(p), p])
    .sort((a, b) => b[0] - a[0] || (b[1].dato || "").localeCompare(a[1].dato || ""))
    .slice(0, MAKS_I_SØGNING)
    .map(([, p]) => p);
}

/* ------------------------------------------------------------------ */
/*  Stilark                                                            */
/* ------------------------------------------------------------------ */

const STIL = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=IBM+Plex+Mono:wght@400;500&display=swap');

.vd { --rod:#cb142a; --rod-dyb:#8E0E1D; --rod-lys:#FDEEF0;
      --blaek:#1A1418; --graa:#6E6369; --linje:#E8DDE0; --hvid:#FFFFFF;
      background:var(--hvid); color:var(--blaek); min-height:100vh;
      font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      font-size:16px; line-height:1.55; }
.vd *,.vd *::before,.vd *::after { box-sizing:border-box; }
:where(.vd) button { font:inherit; cursor:pointer; border:none; background:none; color:inherit; }
.vd input,.vd select,.vd textarea { font:inherit; color:inherit; }
.vd :focus-visible { outline:2px solid var(--rod); outline-offset:2px; border-radius:2px; }

.vd-display { font-family:"Bricolage Grotesque",system-ui,sans-serif; letter-spacing:-0.02em; }
.vd-mono { font-family:"IBM Plex Mono",ui-monospace,monospace; }
.vd-skjult { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden;
  clip:rect(0,0,0,0); white-space:nowrap; border:0; }

/* Topbjælke */
.vd-top { background:var(--rod); color:#fff; }
.vd-top-ind { max-width:980px; margin:0 auto; padding:18px 22px;
  display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.vd-mærke { font-family:"Bricolage Grotesque",system-ui,sans-serif; font-weight:800;
  font-size:23px; letter-spacing:-0.03em; line-height:1.1; margin:0; }
.vd-mærke span { display:block; font-family:"IBM Plex Mono",monospace; font-weight:400;
  font-size:11px; letter-spacing:0.14em; text-transform:uppercase; opacity:.82; margin-top:3px; }
.vd-del { background:#fff; color:var(--rod-dyb); font-weight:600; font-size:15px;
  padding:11px 20px; border-radius:999px; transition:transform .12s ease; }
.vd-del:hover { transform:translateY(-1px); }

/* Indhold */
.vd-ind { max-width:980px; margin:0 auto; padding:0 22px 80px; }

/* Søgehero */
.vd-hero { border-bottom:1px solid var(--linje); padding:44px 0 30px; }
.vd-hero h2 { font-family:"Bricolage Grotesque",system-ui,sans-serif; font-weight:600;
  font-size:clamp(26px,4vw,38px); letter-spacing:-0.03em; margin:0 0 18px; }
.vd-soegerække { display:flex; gap:10px; flex-wrap:wrap; }
.vd-soegefelt { flex:1 1 320px; min-width:0; padding:15px 18px; border:1.5px solid var(--linje);
  border-radius:4px; background:#fff; }
.vd-soegefelt::placeholder { color:#7E7378; }
.vd-soegefelt:focus { border-color:var(--rod); outline:none; }
.vd-knap { background:var(--rod); color:#fff; font-weight:600; padding:15px 26px; border-radius:4px; }
.vd-knap:hover { background:var(--rod-dyb); }
.vd-knap:disabled { opacity:.5; cursor:default; }
.vd-eksempler { margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; align-items:baseline; }
.vd-eksempler b { font-family:"IBM Plex Mono",monospace; font-weight:400; font-size:11px;
  letter-spacing:.12em; text-transform:uppercase; color:var(--graa); }
.vd-eks { font-size:13.5px; color:var(--rod-dyb); background:var(--rod-lys);
  padding:5px 11px; border-radius:999px; text-align:left; }
.vd-eks:hover { background:#F6DDE1; }

/* Værktøjslinje */
.vd-vaerktoej { display:flex; gap:20px; flex-wrap:wrap; align-items:center;
  padding:16px 0; border-bottom:1px solid var(--linje); }
.vd-gruppe { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.vd-etiket { font-family:"IBM Plex Mono",monospace; font-size:11px; letter-spacing:.12em;
  text-transform:uppercase; color:var(--graa); }
.vd-tab { font-size:14px; padding:5px 12px; border-radius:999px; color:var(--graa);
  border:1px solid transparent; }
.vd-tab:hover { color:var(--blaek); }
.vd-tab[aria-pressed="true"] { background:var(--rod); color:#fff; }
.vd-retning { margin-left:6px; font-size:12px; opacity:.85; }
.vd-filter { font-size:13.5px; padding:5px 12px; border-radius:999px;
  border:1px solid var(--linje); display:inline-flex; align-items:center; gap:7px; }
.vd-prik { width:8px; height:8px; border-radius:50%; flex:none; }
.vd-filter[aria-pressed="true"] { border-color:currentColor; font-weight:600; }
.vd-taeller { margin-left:auto; font-family:"IBM Plex Mono",monospace; font-size:12px; color:var(--graa); }

/* Opslag */
.vd-liste { list-style:none; margin:24px 0 0; padding:0;
  display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; align-items:start; }
.vd-post { border:1px solid var(--linje); border-radius:5px; padding:20px 20px 16px; background:#fff;
  transition:box-shadow .6s ease, border-color .6s ease; }
.vd-post.vd-ny { border-color:var(--rod); box-shadow:0 0 0 3px var(--rod-lys); }
.vd-hoved { font-family:"IBM Plex Mono",monospace; font-size:12px; line-height:1.5;
  display:flex; gap:9px; flex-wrap:wrap; margin-bottom:10px; }
.vd-hoved .d { color:var(--graa); }
.vd-hoved .n { color:var(--rod); text-transform:uppercase; letter-spacing:.06em; word-break:break-word; }
.vd-titel { font-family:"Bricolage Grotesque",system-ui,sans-serif; font-weight:600;
  font-size:18px; letter-spacing:-0.02em; line-height:1.3; margin:0 0 8px; }
.vd-titel a { color:inherit; text-decoration:none; background-image:linear-gradient(currentColor,currentColor);
  background-size:0% 1.5px; background-repeat:no-repeat; background-position:0 100%; transition:background-size .2s; }
.vd-titel a:hover { background-size:100% 1.5px; }
.vd-resume { color:#40383D; font-size:14.5px; margin:0; white-space:pre-line; }
.vd-resume.vd-klip { display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden; }
.vd-fold { display:flex; align-items:center; justify-content:center; width:100%;
  margin-top:9px; padding:9px 0 5px; border-top:1px solid var(--linje); color:var(--graa); }
.vd-fold:hover { color:var(--rod); }
.vd-fold svg { transition:transform .18s ease; }
.vd-fold[aria-expanded="true"] svg { transform:rotate(180deg); }
.vd-meta { display:flex; gap:9px; flex-wrap:wrap; align-items:center; font-size:12.5px;
  color:var(--graa); margin-top:14px; }
.vd-chip { display:inline-flex; align-items:center; gap:7px; padding:3px 11px;
  border:1px solid var(--linje); border-radius:999px; font-size:12.5px; color:var(--blaek); }
.vd-slet { font-size:12.5px; color:var(--graa); text-decoration:underline; text-underline-offset:3px; }
.vd-slet:hover { color:var(--rod); }
.vd-begrund { margin:0 0 10px; padding:9px 13px; background:var(--rod-lys);
  border-left:2px solid var(--rod); font-size:13.5px; color:var(--rod-dyb); }

/* Tom tilstand */
.vd-post-ret { background:var(--rod-lys); border-color:var(--rod); }
.vd-post-ret .vd-input { background:#fff; }
.vd-post-ret .vd-mark { margin-bottom:14px; }
.vd-post-ret .vd-todelt { grid-template-columns:1fr; gap:0; }
.vd-post-ret .vd-rethoved { font-family:"IBM Plex Mono",monospace; font-size:11px;
  letter-spacing:.14em; text-transform:uppercase; color:var(--rod); margin-bottom:14px; }
.vd-tom { padding:60px 0; text-align:center; color:var(--graa); }
.vd-tom h3 { font-family:"Bricolage Grotesque",system-ui,sans-serif; font-weight:600;
  font-size:22px; color:var(--blaek); margin:0 0 8px; }

/* Formular */
.vd-form { max-width:640px; padding:38px 0 0; }
.vd-form h2 { font-family:"Bricolage Grotesque",system-ui,sans-serif; font-weight:600;
  font-size:30px; letter-spacing:-0.03em; margin:0 0 6px; }
.vd-form > p.intro { color:var(--graa); margin:0 0 28px; }
.vd-mark { display:block; margin-bottom:20px; }
.vd-mark > span { display:block; font-family:"IBM Plex Mono",monospace; font-size:11px;
  letter-spacing:.12em; text-transform:uppercase; color:var(--graa); margin-bottom:7px; }
.vd-input { width:100%; padding:12px 14px; border:1.5px solid var(--linje); border-radius:4px; background:#fff; }
.vd-input:focus { border-color:var(--rod); outline:none; }
textarea.vd-input { resize:vertical; min-height:78px; }
textarea.vd-lang { min-height:150px; font-size:14px; }
.vd-navnerække { display:flex; gap:8px; }
.vd-navnerække select { flex:1; }
.vd-tilfoej { border:1.5px solid var(--linje); border-radius:4px; padding:0 16px; font-size:14px; white-space:nowrap; }
.vd-tilfoej:hover { border-color:var(--rod); color:var(--rod); }
.vd-todelt { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.vd-handling { display:flex; gap:12px; align-items:center; margin-top:26px; }
.vd-annuller { color:var(--graa); text-decoration:underline; text-underline-offset:3px; font-size:15px; }
.vd-filfelt { padding:10px 12px; font-size:14px; }
.vd-filfelt::file-selector-button { font:inherit; font-weight:600; border:1px solid var(--linje);
  background:#fff; color:var(--rod-dyb); padding:6px 13px; border-radius:3px; margin-right:12px; cursor:pointer; }
.vd-filfelt::file-selector-button:hover { border-color:var(--rod); }
.vd-mark > .vd-hjaelp, .vd-hjaelp { display:block; margin-top:7px; font-size:13px; color:var(--graa);
  font-family:system-ui,sans-serif; letter-spacing:0; text-transform:none; }
.vd-tip { border:1px solid var(--linje); border-radius:4px; padding:12px 14px; font-size:14px;
  color:#40383D; margin:0 0 22px; }
.vd-tip a { color:var(--rod-dyb); font-weight:600; white-space:nowrap; }
.vd-aabn { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:999px;
  background:var(--rod-lys); color:var(--rod-dyb); font-size:13.5px; font-weight:600; text-decoration:none; }
.vd-aabn:hover { background:#F6DDE1; }
.vd-links { display:flex; flex-wrap:wrap; gap:8px 10px; align-items:center; margin-top:12px; }
.vd-nyfane { font-size:13px; color:var(--graa); }
.vd-linkrække { display:flex; gap:8px; margin-bottom:8px; }
.vd-linkurl { flex:2 1 0; min-width:0; }
.vd-linknavn { flex:1 1 0; min-width:0; }
.vd-fjern { flex:none; width:44px; border:1.5px solid var(--linje); border-radius:4px;
  font-size:20px; line-height:1; color:var(--graa); }
.vd-fjern:hover { border-color:var(--rod); color:var(--rod); }
.vd-flere { padding:8px 14px; }
.vd-bemaerk { border-left:2px solid var(--rod); background:var(--rod-lys); color:var(--rod-dyb);
  padding:11px 14px; font-size:14px; margin:-6px 0 20px; }
.vd-fejl { color:var(--rod-dyb); background:var(--rod-lys); padding:11px 14px;
  border-radius:4px; font-size:14px; margin-bottom:18px; }

/* Gennemsyn */
.vd-gennemsyn { border:1.5px solid var(--rod); border-radius:6px; padding:22px; margin-bottom:22px; background:#fff; }
.vd-gennemsyn h3 { font-family:"Bricolage Grotesque",system-ui,sans-serif; font-weight:600;
  font-size:17px; margin:0 0 4px; }
.vd-gennemsyn .hint { font-size:13px; color:var(--graa); margin:0 0 20px; }

/* Status */
.vd-status { display:flex; align-items:center; gap:10px; font-size:14.5px; color:var(--graa); }
.vd-spinner { width:15px; height:15px; border:2px solid var(--linje); border-top-color:var(--rod);
  border-radius:50%; animation:vd-snur .7s linear infinite; flex:none; }
@keyframes vd-snur { to { transform:rotate(360deg); } }

.vd-fod { max-width:980px; margin:0 auto; padding:0 22px 40px; font-size:12.5px; color:var(--graa); }
.vd-fod button { font-size:12.5px; color:var(--graa); text-decoration:underline; text-underline-offset:3px; }
.vd-fod button:hover { color:var(--rod); }

/* Beskedbjælke nederst */
.vd-besked { position:fixed; left:50%; bottom:22px; transform:translateX(-50%); z-index:10;
  display:flex; gap:16px; align-items:center; width:max-content; max-width:calc(100% - 32px);
  background:var(--blaek); color:#fff; padding:12px 18px; border-radius:6px;
  box-shadow:0 6px 24px rgba(0,0,0,.18); font-size:14.5px; }
.vd-besked button { color:#fff; font-weight:600; text-decoration:underline; text-underline-offset:3px; white-space:nowrap; }

/* Slettede opslag */
.vd-papirkurv .vd-post { opacity:.85; }
.vd-papirkurv .vd-meta { margin-top:10px; }

@media (max-width:760px) {
  .vd-liste { grid-template-columns:1fr; }
}
@media (max-width:620px) {
  .vd-todelt { grid-template-columns:1fr; }
  .vd-linkrække { flex-wrap:wrap; padding-bottom:12px; margin-bottom:12px;
    border-bottom:1px dashed var(--linje); }
  .vd-linkurl { flex-basis:100%; }
  /* Filtrene på én vandret, rulbar linje i stedet for fem linjer */
  .vd-filtre { flex-wrap:nowrap; overflow-x:auto; width:100%; padding-bottom:4px;
    scrollbar-width:thin; }
  .vd-filtre > * { flex:none; }
}
@media (prefers-reduced-motion:reduce) {
  .vd *, .vd *::before { animation-duration:.001ms !important; transition-duration:.001ms !important; }
}
`;

/* ------------------------------------------------------------------ */
/*  Underkomponenter                                                   */
/* ------------------------------------------------------------------ */

function Status({ tekst }) {
  return (
    <div className="vd-status" role="status" aria-live="polite">
      <div className="vd-spinner" aria-hidden="true" />
      <span>{tekst}</span>
    </div>
  );
}

function Pil() {
  return (
    <svg width="17" height="11" viewBox="0 0 17 11" fill="none" aria-hidden="true">
      <path
        d="M1.5 1.75L8.5 8.75L15.5 1.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Knapperne på kortet — én pr. link */
function LinkKnapper({ links }) {
  const gyldige = links.filter((l) => erWebadresse(l.url));
  if (gyldige.length === 0) return null;
  return (
    <div className="vd-links">
      {gyldige.map((l, i) => (
        <a
          key={i}
          className="vd-aabn"
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Åbner i en ny fane"
        >
          {knapTekst(l)} <span aria-hidden="true">↗</span>
        </a>
      ))}
    </div>
  );
}

/* Felter til ét eller flere links med et valgfrit navn hver */
function LinkFelter({ links, onChange, førsteRef }) {
  const ret = (i, felt, værdi) =>
    onChange(links.map((l, j) => (j === i ? { ...l, [felt]: værdi } : l)));
  return (
    <div className="vd-mark">
      <span>Links — fx til slides, optagelse eller artikel</span>
      {links.map((l, i) => (
        <div key={i} className="vd-linkrække">
          <input
            ref={i === 0 ? førsteRef : undefined}
            className="vd-input vd-linkurl"
            placeholder="https://"
            aria-label={`Link ${i + 1}`}
            value={l.url}
            onChange={(e) => ret(i, "url", e.target.value)}
          />
          <input
            className="vd-input vd-linknavn"
            placeholder={i === 0 ? "Navn, fx Slides" : "Navn, fx Optagelse"}
            aria-label={`Navn på link ${i + 1}, valgfrit`}
            value={l.navn}
            onChange={(e) => ret(i, "navn", e.target.value)}
          />
          {links.length > 1 && (
            <button
              className="vd-fjern"
              aria-label={`Fjern link ${i + 1}`}
              title="Fjern linket"
              onClick={() => onChange(links.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        className="vd-tilfoej vd-flere"
        onClick={() => onChange([...links, { url: "", navn: "" }])}
      >
        + Tilføj endnu et link
      </button>
      <span className="vd-hjaelp">
        Navnet er valgfrit og står på knappen. Uden navn viser knappen filtypen.
      </span>
    </div>
  );
}

function Opslag({ post, begrundelse, navne, ny, onSlet, onRet }) {
  const [bekræft, setBekræft] = useState(false);
  const [udkast, setUdkast] = useState(null);
  const [åben, setÅben] = useState(false);
  const [kanFoldes, setKanFoldes] = useState(false);
  const [retfejl, setRetfejl] = useState("");
  const førsteFelt = useRef(null);
  const resumeRef = useRef(null);
  const kortRef = useRef(null);

  /* Et opslag, man lige har delt, rulles frem, så man kan se det */
  useEffect(() => {
    if (ny && kortRef.current && kortRef.current.scrollIntoView) {
      kortRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [ny]);

  useEffect(() => {
    if (udkast && førsteFelt.current) førsteFelt.current.focus();
  }, [udkast !== null]);

  useEffect(() => {
    const mål = () => {
      const el = resumeRef.current;
      if (el && el.classList.contains("vd-klip")) {
        setKanFoldes(el.scrollHeight > el.clientHeight + 2);
      }
    };
    mål();
    const t = setTimeout(mål, 400); // igen når webfonten er hentet
    window.addEventListener("resize", mål);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", mål);
    };
  }, [post.opsummering, udkast]);

  if (udkast) {
    return (
      <li className="vd-post vd-post-ret">
        <div className="vd-rethoved">Redigér opslag</div>
        <div>
          <label className="vd-mark">
            <span>Titel</span>
            <input
              ref={førsteFelt}
              className="vd-input"
              value={udkast.titel}
              onChange={(e) => setUdkast({ ...udkast, titel: e.target.value })}
            />
          </label>
          <label className="vd-mark">
            <span>Opsummering</span>
            <textarea
              className="vd-input"
              value={udkast.opsummering}
              onChange={(e) => setUdkast({ ...udkast, opsummering: e.target.value })}
            />
          </label>
          <div className="vd-todelt">
            <label className="vd-mark">
              <span>Fagområde</span>
              <select
                className="vd-input"
                value={udkast.kategori}
                onChange={(e) => setUdkast({ ...udkast, kategori: e.target.value })}
              >
                {FAGOMRAADER.map((f) => (
                  <option key={f.navn}>{f.navn}</option>
                ))}
              </select>
            </label>
            <label className="vd-mark">
              <span>Type</span>
              <select
                className="vd-input"
                value={udkast.type}
                onChange={(e) => setUdkast({ ...udkast, type: e.target.value })}
              >
                {TYPER.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="vd-todelt">
            <label className="vd-mark">
              <span>Hvem deler</span>
              <select
                className="vd-input"
                value={udkast.navn}
                onChange={(e) => setUdkast({ ...udkast, navn: e.target.value })}
              >
                {!navne.includes(udkast.navn) && <option>{udkast.navn}</option>}
                {navne.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="vd-mark">
              <span>Dato</span>
              <input
                type="date"
                className="vd-input"
                value={udkast.dato}
                onChange={(e) => setUdkast({ ...udkast, dato: e.target.value })}
              />
            </label>
          </div>
          <LinkFelter
            links={udkast.links}
            onChange={(links) => setUdkast({ ...udkast, links })}
          />
          {retfejl && <div className="vd-fejl" role="alert">{retfejl}</div>}
          <div className="vd-handling" style={{ marginTop: 4 }}>
            <button
              className="vd-knap"
              onClick={() => {
                const renset = rensLinks(udkast.links);
                if (renset.fejl) return setRetfejl(renset.fejl);
                setRetfejl("");
                onRet({ ...post, ...udkast, links: renset.links, url: renset.links[0].url });
                setUdkast(null);
              }}
            >
              Gem ændringer
            </button>
            <button
              className="vd-annuller"
              onClick={() => {
                setRetfejl("");
                setUdkast(null);
              }}
            >
              Fortryd
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li ref={kortRef} className={`vd-post${ny ? " vd-ny" : ""}`}>
      <div className="vd-hoved">
        <span className="d">{visDato(post.dato)}</span>
        <span aria-hidden="true">·</span>
        <span className="n">{post.navn}</span>
      </div>
      <h3 className="vd-titel">
        <a
          href={erWebadresse(post.url) ? post.url : undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {post.titel}
        </a>
      </h3>
      {begrundelse && <p className="vd-begrund">{begrundelse}</p>}
      <p ref={resumeRef} className={`vd-resume${åben ? "" : " vd-klip"}`}>
        {post.opsummering}
      </p>
      {(kanFoldes || åben) && (
        <button
          className="vd-fold"
          aria-expanded={åben}
          aria-label={åben ? "Vis mindre" : "Læs hele opsummeringen"}
          title={åben ? "Vis mindre" : "Læs hele"}
          onClick={() => setÅben(!åben)}
        >
          <Pil />
        </button>
      )}
      <LinkKnapper links={linksFor(post)} />
      <div className="vd-meta">
        <span className="vd-chip" style={{ color: farveFor(post.kategori) }}>
          <span className="vd-prik" style={{ background: farveFor(post.kategori) }} />
          <span style={{ color: "#1A1418" }}>{post.kategori}</span>
        </span>
        <span className="vd-chip">{post.type}</span>
        <span aria-hidden="true">·</span>
        {bekræft ? (
          <>
            <button className="vd-slet" onClick={() => onSlet(post.id)}>
              Ja, slet
            </button>
            <button className="vd-slet" onClick={() => setBekræft(false)}>
              Fortryd
            </button>
          </>
        ) : (
          <>
            <button
              className="vd-slet"
              onClick={() =>
                setUdkast({
                  titel: post.titel,
                  opsummering: post.opsummering,
                  kategori: post.kategori,
                  type: post.type,
                  navn: post.navn,
                  dato: post.dato,
                  links: linksFor(post).map((l) => ({ ...l })),
                })
              }
            >
              Redigér
            </button>
            <button className="vd-slet" onClick={() => setBekræft(true)}>
              Slet
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Adgangskode                                                        */
/* ------------------------------------------------------------------ */

function Adgangskode({ forkert, onIndsend }) {
  const [kode, setKode] = useState("");
  const [arbejder, setArbejder] = useState(false);
  const [udfald, setUdfald] = useState(forkert ? "forkert" : "");

  return (
    <form
      className="vd-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!kode.trim()) return;
        setArbejder(true);
        const svar = await onIndsend(kode.trim());
        if (svar !== "ok") {
          setUdfald(svar);
          setArbejder(false);
        }
      }}
    >
      <h2 className="vd-display">Skriv adgangskoden</h2>
      <p className="intro">
        Kataloget er kun for kolleger. Koden huskes i denne browser, så du skal kun skrive
        den én gang.
      </p>
      {udfald && !arbejder && (
        <div className="vd-fejl" role="alert">
          {udfald === "forkert"
            ? "Koden passede ikke. Prøv igen, eller spørg en kollega."
            : "Serveren svarede ikke. Prøv igen om lidt."}
        </div>
      )}
      <label className="vd-mark">
        <span>Adgangskode</span>
        <input
          type="password"
          className="vd-input"
          autoComplete="current-password"
          autoFocus
          value={kode}
          onChange={(e) => setKode(e.target.value)}
        />
      </label>
      <div className="vd-handling">
        {arbejder ? (
          <Status tekst="Tjekker koden…" />
        ) : (
          <button type="submit" className="vd-knap">
            Åbn kataloget
          </button>
        )}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Formular                                                           */
/* ------------------------------------------------------------------ */

function Formular({ navne, onGem, onAnnuller, onNytNavn }) {
  const [links, setLinks] = useState([{ url: "", navn: "" }]);
  const [navn, setNavn] = useState(() => {
    const mit = hentMitNavn();
    return navne.includes(mit) ? mit : navne[0] || "";
  });
  const [dato, setDato] = useState(idag());
  const [note, setNote] = useState("");
  const [transskription, setTransskription] = useState("");
  const [filer, setFiler] = useState([]);
  const [fejl, setFejl] = useState("");
  const [arbejder, setArbejder] = useState(false);
  const [udkast, setUdkast] = useState(null);
  const nytNavnFelt = useRef(null);
  const [tilføjer, setTilføjer] = useState(false);
  const [nytNavn, setNytNavn] = useState("");

  useEffect(() => {
    if (tilføjer && nytNavnFelt.current) nytNavnFelt.current.focus();
  }, [tilføjer]);

  const gemNytNavn = () => {
    const n = nytNavn.trim();
    if (!n) return;
    onNytNavn(n);
    setNavn(n);
    setNytNavn("");
    setTilføjer(false);
  };

  async function analyser() {
    setFejl("");
    const renset = rensLinks(links);
    if (renset.fejl) return setFejl(renset.fejl);
    const liste = renset.links;
    setLinks(liste);
    if (!navn) return setFejl("Vælg dit navn på listen.");
    setArbejder(true);

    const hoved = liste[0].url;
    const offentligt = liste.find((l) => !BAG_LOGIN.test(l.url));
    const bagLogin = !offentligt; // alle links kræver login
    if (bagLogin && filer.length === 0 && !transskription.trim() && !note.trim()) {
      setArbejder(false);
      return setFejl(
        "AI'en kan ikke åbne filer bag skolens login. Vedhæft de samme filer nedenfor, indsæt et par afsnit fra dem, eller skriv en note om, hvad de handler om."
      );
    }

    /* Offentlige links (fx programmet for en konference) hentes altid med —
       også når der er vedhæftet filer. YouTube har sin egen titelopslag. */
    const ytLink = liste.find((l) => ER_YOUTUBE.test(l.url));
    const [yt, ...hentede] = await Promise.all([
      ytLink ? hentYouTubeInfo(ytLink.url) : null,
      ...liste
        .filter((l) => !BAG_LOGIN.test(l.url) && !ER_YOUTUBE.test(l.url))
        .slice(0, 3)
        .map(async (l) => ({ link: l, side: await hentSideTekst(l.url) })),
    ]);
    const sider = hentede.filter((h) => h.side);
    const side = sider.length ? sider[0].side : null;

    /* Afsnit med tekst til AI'en. Websider og indsat tekst får fast plads;
       filerne deler resten af loftet ligeligt. */
    const afsnit = [];
    const indsat = transskription.trim().slice(0, MAKS_INDSAT);
    if (indsat) afsnit.push({ overskrift: "Tekst, kollegaen har indsat", tekst: indsat });
    for (const { link, side: s } of sider) {
      afsnit.push({
        overskrift: `Webside${link.navn ? ` (${link.navn})` : ""}: ${s.titel || link.url} — ${link.url}`,
        tekst: s.tekst.slice(0, MAKS_SIDE),
      });
    }
    const brugt = afsnit.reduce((sum, a) => sum + a.tekst.length, 0);
    const filLoft = Math.floor(Math.max(MAKS_SAMLET - brugt, 20000) / Math.max(filer.length, 1));

    /* Vedhæftede filer bliver til tekst her i browseren. Kun billeder og
       scannede PDF'er sendes som fil, så længe de tilsammen holder sig under
       grænsen for ét kald. */
    const filBlokke = [];
    let plads = MAKS_DIREKTE;
    for (const fil of filer) {
      let læst;
      try {
        læst = await læsFil(fil, plads, filLoft);
      } catch (e) {
        setArbejder(false);
        return setFejl(
          /^Billedet/.test(e.message)
            ? e.message
            : `${fil.name} kunne ikke læses. Fjern den, eller indsæt et par afsnit fra den i tekstfeltet.`
        );
      }
      const tekst = (læst.tekst || "").trim();
      if (læst.blok) {
        filBlokke.push(læst.blok);
        plads -= fil.size;
      } else if (tekst) {
        afsnit.push({ overskrift: `Vedhæftet fil: ${fil.name}`, tekst });
      } else {
        setArbejder(false);
        return setFejl(
          `Der er ingen tekst i ${fil.name}, som AI'en kan læse — måske er den scannet. Fjern den, indsæt teksten selv, eller beskriv filen i noten.`
        );
      }
    }
    const tekstKilde = afsnit
      .map((a) => `=== ${a.overskrift} ===\n${a.tekst}`)
      .join("\n\n");

    const kilde =
      filBlokke.length || afsnit.length
        ? `Nedenfor${filBlokke.length ? " og i de vedhæftede filer" : ""} står indholdet fra kilderne. Brug dem alle sammen — et program fortæller fx, hvem der talte om hvad, mens slides giver indholdet. Byg titel, fagområde og opsummering på det, der faktisk står. Søg ikke.${
            sider.length
              ? " Tekst fra websider er hentet råt, så se bort fra menupunkter, cookiebeskeder, kontaktoplysninger og gentagelser."
              : ""
          }`
        : bagLogin
        ? `Linkene peger på filer bag skolens login, som du ikke kan åbne. Søg ikke, og find aldrig på indhold. Byg titel og opsummering på kollegaens note, og indled opsummeringen med "Kunne ikke læses automatisk."`
        : `Slå ${offentligt.url} op på nettet, hvis siden er offentligt tilgængelig. Søg højst én gang. Kan du ikke komme ind — fordi siden kræver login, eller fordi indholdet er en video eller podcast, du hverken kan se eller høre — så find aldrig på indhold. Skriv i stedet en opsummering, der bygger på kollegaens note, og indled den med "Kunne ikke læses automatisk."`;
    const linkliste = liste
      .map((l, i) => {
        const format = filformat(l.url);
        const ekstra = [l.navn, format && `filtype: ${format}`].filter(Boolean).join(", ");
        return `${liste.length > 1 ? `${i + 1}. ` : ""}${l.url}${ekstra ? ` (${ekstra})` : ""}`;
      })
      .join("\n");

    const opgave = `Du hjælper undervisere på Markedsføringsøkonom-uddannelsen på et dansk erhvervsakademi med at katalogisere delt viden.

${liste.length > 1 ? "Links" : "Link"}:
${linkliste}${
      yt ? `\nVideoens rigtige titel: "${yt.titel}"${yt.kanal ? ` (kanal: ${yt.kanal})` : ""}` : ""
    }
Kollegaens egen note: ${note.trim() || "(ingen)"}

${kilde}
${tekstKilde ? `\nKilder:\n"""\n${tekstKilde}\n"""\n` : ""}
Opsummeringen skal stå mål med materialet:
- En enkelt artikel, video eller kort tekst: 2-3 sætninger.
- Omfattende materiale, fx en konference, mange slides eller flere oplæg: én indledende sætning, derefter én linje pr. oplæg eller hovedtema, der begynder med "• " og nævner oplægsholder eller organisation og de vigtigste pointer og tal (højst 12 linjer), og til sidst én sætning om, hvad det kan bruges til i undervisningen. Adskil linjerne med \\n.

Svar KUN med JSON. Skriv intet før og intet efter — ingen indledning, ingen markdown:
{"titel":"kort sigende titel på dansk, max 12 ord","kategori":"et af: ${FAGLISTE}","type":"et af: ${TYPER.join(", ")}","opsummering":"på dansk i almindeligt sprog, som beskrevet ovenfor"}`;

    try {
      const indhold = filBlokke.length ? [...filBlokke, { type: "text", text: opgave }] : opgave;
      const brugSøgning = !filBlokke.length && !tekstKilde && !bagLogin;
      let svar = await spørgClaude(indhold, brugSøgning);
      let j = udtrækJson(svar);
      if (!j && brugSøgning) {
        // websøgningen brugte svaret op — prøv igen uden den
        svar = await spørgClaude(opgave, false);
        j = udtrækJson(svar);
      }
      j = j || {};
      setUdkast({
        titel: j.titel || (yt && yt.titel) || (side && side.titel) || pænUrl(hoved),
        kategori: FAGOMRAADER.some((f) => f.navn === j.kategori)
          ? j.kategori
          : "Markedsføring",
        type: TYPER.includes(j.type) ? j.type : gætType(hoved),
        opsummering: j.opsummering || note.trim() || "",
      });
      if (!j.opsummering) {
        setFejl(
          "AI'en kunne ikke få fat i indholdet. Indsæt transskriptionen eller en beskrivelse, eller skriv opsummeringen selv nedenfor."
        );
      }
    } catch (e) {
      setUdkast({
        titel: (yt && yt.titel) || pænUrl(hoved),
        kategori: "Markedsføring",
        type: gætType(hoved),
        opsummering: note.trim() || "",
      });
      setFejl(
        medDetalje("AI'en kunne ikke læse kilden. Skriv selv titel og opsummering nedenfor.", e)
      );
    }
    setArbejder(false);
  }

  if (udkast) {
    return (
      <div className="vd-form">
        <h2 className="vd-display">Se det efter</h2>
        <p className="intro">
          AI'en har foreslået titel, fagområde og opsummering. Ret det, der ikke passer —
          det er dit opslag, der bliver gemt.
        </p>
        {fejl && <div className="vd-fejl" role="alert">{fejl}</div>}
        <div className="vd-gennemsyn">
          <label className="vd-mark">
            <span>Titel</span>
            <input
              className="vd-input"
              value={udkast.titel}
              onChange={(e) => setUdkast({ ...udkast, titel: e.target.value })}
            />
          </label>
          <div className="vd-todelt">
            <label className="vd-mark">
              <span>Fagområde</span>
              <select
                className="vd-input"
                value={udkast.kategori}
                onChange={(e) => setUdkast({ ...udkast, kategori: e.target.value })}
              >
                {FAGOMRAADER.map((f) => (
                  <option key={f.navn}>{f.navn}</option>
                ))}
              </select>
            </label>
            <label className="vd-mark">
              <span>Type</span>
              <select
                className="vd-input"
                value={udkast.type}
                onChange={(e) => setUdkast({ ...udkast, type: e.target.value })}
              >
                {TYPER.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="vd-mark" style={{ marginBottom: 0 }}>
            <span>Opsummering</span>
            <textarea
              className="vd-input"
              value={udkast.opsummering}
              onChange={(e) => setUdkast({ ...udkast, opsummering: e.target.value })}
            />
          </label>
        </div>
        <div className="vd-handling">
          <button
            className="vd-knap"
            onClick={() => {
              gemMitNavn(navn);
              const gemte = rensLinks(links).links;
              onGem({
                id: `p${Date.now()}${Math.floor(Math.random() * 999)}`,
                url: gemte[0].url,
                links: gemte,
                navn,
                dato,
                ...udkast,
              });
            }}
          >
            Del med kollegerne
          </button>
          <button className="vd-annuller" onClick={() => setUdkast(null)}>
            Tilbage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vd-form">
      <h2 className="vd-display">Del ny viden</h2>
      <p className="intro">
        Indsæt linket, så foreslår AI'en titel, fagområde og en kort opsummering, som du
        kan rette bagefter.
      </p>
      {fejl && <div className="vd-fejl" role="alert">{fejl}</div>}

      <div className="vd-tip">
        <b>Har du selv filen?</b> En video, PowerPoint eller PDF fra en konference eller et
        webinar lægges i mappen <i>Videndeling</i> under <i>Filer</i> i Teams-kanalen. Vælg{" "}
        <i>Del → Kopiér link</i> på filen og indsæt linket her. Hører der flere filer til,
        fx slides og optagelse, så tilføj et link til hver.
        {TEAMS_MAPPE && (
          <div style={{ marginTop: 8 }}>
            <a href={TEAMS_MAPPE} target="_blank" rel="noopener noreferrer">
              Åbn mappen i Teams ↗
            </a>{" "}
            <span className="vd-nyfane">(åbner i en ny fane, så denne side bliver stående)</span>
          </div>
        )}
      </div>

      <LinkFelter links={links} onChange={setLinks} />

      <div className="vd-todelt">
        <label className="vd-mark">
          <span>Hvem deler</span>
          {tilføjer ? (
            <div className="vd-navnerække">
              <input
                ref={nytNavnFelt}
                className="vd-input"
                placeholder="Nyt navn"
                value={nytNavn}
                onChange={(e) => setNytNavn(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && gemNytNavn()}
              />
              <button className="vd-tilfoej" onClick={gemNytNavn}>
                Gem
              </button>
            </div>
          ) : (
            <div className="vd-navnerække">
              <select
                className="vd-input"
                value={navn}
                onChange={(e) => setNavn(e.target.value)}
              >
                {navne.length === 0 && <option value="">Ingen navne endnu</option>}
                {navne.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              <button className="vd-tilfoej" onClick={() => setTilføjer(true)}>
                + Navn
              </button>
            </div>
          )}
        </label>

        <label className="vd-mark">
          <span>Dato</span>
          <input
            type="date"
            className="vd-input"
            value={dato}
            onChange={(e) => setDato(e.target.value)}
          />
        </label>
      </div>

      <label className="vd-mark">
        <span>Vedhæft de samme filer — så kan AI'en læse dem</span>
        <input
          type="file"
          multiple
          accept=".pdf,.pptx,.docx,application/pdf,image/png,image/jpeg,image/webp"
          className="vd-input vd-filfelt"
          onChange={(e) => {
            setFejl("");
            setFiler([...(e.target.files || [])]);
          }}
        />
        <span className="vd-hjaelp">
          {filer.length
            ? `${filer.map((f) => f.name).join(", ")} læses kun til opsummeringen og gemmes ikke her — filerne bliver i Teams.`
            : "PowerPoint, Word, PDF eller billede — vælg gerne flere. Linkene er det, kollegerne klikker på."}
        </span>
      </label>

      {!filer.length && links.some((l) => ER_M365.test(l.url)) && (
        <div className="vd-bemaerk">
          Linket peger på en fil i Teams. AI'en kan ikke åbne den bag skolens login —
          vedhæft den samme fil ovenfor, så kan AI'en læse den.
          {links.some((l) => ER_M365.test(l.url) && filformat(l.url) === "Video") &&
            " Er det en video, så åbn den i Teams og kopiér transskriptionen ind i tekstfeltet nedenfor, hvis der er en."}
        </div>
      )}
      {!filer.length &&
        !links.some((l) => ER_M365.test(l.url)) &&
        links.some((l) => BAG_LOGIN.test(l.url)) && (
        <div className="vd-bemaerk">
          Linket ligger på et drev, der kræver login. AI'en bliver mødt af en loginskærm og
          kan ikke se indholdet — vedhæft filen ovenfor, eller beskriv den i noten.
        </div>
      )}

      <label className="vd-mark">
        <span>Transskription eller tekst fra kilden — valgfri</span>
        <textarea
          className="vd-input vd-lang"
          placeholder="Indsæt transskriptionen, videobeskrivelsen eller et par afsnit fra siden. Det er den sikreste vej til en god opsummering."
          value={transskription}
          onChange={(e) => setTransskription(e.target.value)}
        />
        <span className="vd-hjaelp">
          {transskription.trim()
            ? `${transskription.trim().length.toLocaleString("da-DK")} tegn — opsummeringen bygges på denne tekst.`
            : "Teksten bruges kun til analysen og gemmes ikke."}
        </span>
      </label>

      {!filer.length && !transskription.trim() && links.some((l) => ER_YOUTUBE.test(l.url)) && (
        <div className="vd-bemaerk">
          AI'en kan hverken se eller høre videoen. Åbn transskriptionen på YouTube under
          "Vis udskrift", kopiér den og indsæt den i feltet ovenfor — så bliver
          opsummeringen bygget på det, der faktisk bliver sagt.
        </div>
      )}

      <label className="vd-mark">
        <span>Note til AI'en — valgfri</span>
        <textarea
          className="vd-input"
          placeholder="Fx: kapitel 4 er det interessante, brugbart til forløbet om prissætning"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="vd-handling">
        {arbejder ? (
          <Status
            tekst={
              filer.length
                ? filer.length > 1
                  ? "Læser de vedhæftede filer…"
                  : "Læser den vedhæftede fil…"
                : transskription.trim()
                ? "Læser den indsatte tekst…"
                : "Henter siden og skriver opsummering…"
            }
          />
        ) : (
          <>
            <button className="vd-knap" onClick={analyser}>
              Analysér linket
            </button>
            <button className="vd-annuller" onClick={onAnnuller}>
              Annuller
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hovedkomponent                                                     */
/* ------------------------------------------------------------------ */

export default function Vidensdeling() {
  const [data, setData] = useState({ opslag: [], navne: STANDARDNAVNE });
  const [klar, setKlar] = useState(false);
  const [visning, setVisning] = useState("liste");
  const [sortering, setSortering] = useState("dato");
  const [omvendt, setOmvendt] = useState(false);
  const [filter, setFilter] = useState("");
  const [søgning, setSøgning] = useState("");
  const [søger, setSøger] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [søgefejl, setSøgefejl] = useState("");
  const [låst, setLåst] = useState(false);
  const [lagerfejl, setLagerfejl] = useState("");
  const [besked, setBesked] = useState(null); // { tekst, fortryd?: id }
  const [nytId, setNytId] = useState("");

  /* Beskeden nederst og markeringen af et nyt opslag forsvinder af sig selv */
  useEffect(() => {
    if (!besked) return;
    const t = setTimeout(() => setBesked(null), 8000);
    return () => clearTimeout(t);
  }, [besked]);

  useEffect(() => {
    if (!nytId) return;
    const t = setTimeout(() => setNytId(""), 4000);
    return () => clearTimeout(t);
  }, [nytId]);

  /* 401 betyder, at serveren kræver den fælles adgangskode */
  const håndterLagerfejl = (e, tekst) => {
    if (e && e.status === 401) setLåst(true);
    else setLagerfejl(tekst);
  };

  /* Svarer "ok", "forkert" (forkert kode) eller "fejl" */
  const indlæs = () =>
    hentData()
      .then((d) => {
        setData(d);
        setKlar(true);
        setLåst(false);
        setLagerfejl("");
        return "ok";
      })
      .catch((e) => {
        håndterLagerfejl(e, "Opslagene kunne ikke hentes. Prøv at genindlæse siden om lidt.");
        return e && e.status === 401 ? "forkert" : "fejl";
      });

  useEffect(() => {
    indlæs();
  }, []);

  /* Kører en gemning og returnerer true, hvis den lykkedes */
  const gem = async (handling) => {
    try {
      await handling();
      setLagerfejl("");
      return true;
    } catch (e) {
      håndterLagerfejl(e, "Ændringen kunne ikke gemmes. Prøv igen om lidt.");
      return false;
    }
  };

  /* Lægger et opslag ind i listen, eller erstatter det, hvis det findes */
  const sætOpslag = (post) =>
    setData((d) => ({
      ...d,
      opslag: d.opslag.some((p) => p.id === post.id)
        ? d.opslag.map((p) => (p.id === post.id ? post : p))
        : [post, ...d.opslag],
    }));

  const tilføjOpslag = async (post) => {
    if (!(await gem(() => gemOpslag(post)))) return;
    sætOpslag(post);
    setVisning("liste");
    setResultat(null);
    setSøgning("");
    setFilter("");
    setNytId(post.id);
    setBesked({ tekst: "Dit opslag er delt med kollegerne." });
  };

  const retOpslag = async (post) => {
    const { begrundelse, ...ren } = post; // søgningens begrundelse gemmes ikke
    if (!(await gem(() => gemOpslag(ren)))) return;
    sætOpslag(ren);
    setResultat((r) =>
      r ? r.map((x) => (x.id === ren.id ? { ...ren, begrundelse: x.begrundelse } : x)) : r
    );
  };

  const sletOpslag = async (id) => {
    const post = data.opslag.find((p) => p.id === id);
    if (!post) return;
    const slettet = { ...post, slettet: idag() };
    if (!(await gem(() => gemOpslag(slettet)))) return;
    sætOpslag(slettet);
    setResultat((r) => (r ? r.filter((x) => x.id !== id) : r));
    setBesked({ tekst: `"${post.titel}" er slettet.`, fortryd: id });
  };

  const gendanOpslag = async (id) => {
    const post = data.opslag.find((p) => p.id === id);
    if (!post) return;
    const { slettet, ...gendannet } = post;
    if (!(await gem(() => gemOpslag(gendannet)))) return;
    sætOpslag(gendannet);
    setBesked({ tekst: `"${post.titel}" er gendannet.` });
  };

  const tilføjNavn = async (n) => {
    let navne;
    if (await gem(async () => (navne = await gemNavn(n)))) setData((d) => ({ ...d, navne }));
  };

  const vælgFilter = (k) => setFilter((f) => (f === k ? "" : k));

  const aktive = data.opslag.filter((p) => !p.slettet);
  const slettede = data.opslag
    .filter((p) => p.slettet)
    .sort((a, b) => b.slettet.localeCompare(a.slettet));

  async function søg(tekst = søgning) {
    const q = tekst.trim();
    setSøgefejl("");
    if (!q) return setResultat(null);
    if (aktive.length === 0) return setSøgefejl("Der er ingen opslag at søge i endnu.");
    setSøger(true);
    const katalog = forfiltrer(q, aktive).map((p) => ({
      id: p.id,
      titel: p.titel,
      kategori: p.kategori,
      navn: p.navn,
      dato: p.dato,
      opsummering: (p.opsummering || "").slice(0, 800),
    }));
    const prompt = `Du er søgefunktion i et videndelingskatalog for undervisere på en dansk markedsføringsøkonom-uddannelse.

Kollegaen beskriver sit behov i almindeligt sprog. Find de opslag der reelt dækker behovet — også når ordene ikke er de samme. Tag kun opslag med, der faktisk er relevante; er der ingen, så returnér en tom liste.

Behov: "${q}"

Katalog:
${JSON.stringify(katalog)}

Svar KUN med JSON, uden markdown:
[{"id":"opslagets id","begrundelse":"én kort sætning på dansk om hvorfor netop dette hjælper på behovet"}]
Sortér med det mest relevante først. Højst 8 resultater.`;

    try {
      const svar = await spørgClaude(prompt, false);
      const j = udtrækJson(svar);
      if (!Array.isArray(j)) throw new Error("format");
      const map = new Map(aktive.map((p) => [p.id, p]));
      setResultat(
        j
          .filter((r) => r && map.has(r.id))
          .map((r) => ({ ...map.get(r.id), begrundelse: r.begrundelse }))
      );
    } catch (e) {
      const ord = q.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      setResultat(
        aktive.filter((p) =>
          ord.some((w) => `${p.titel} ${p.opsummering} ${p.kategori}`.toLowerCase().includes(w))
        )
      );
      setSøgefejl(
        medDetalje("AI-søgningen svarede ikke. Nedenfor er en almindelig tekstsøgning i stedet.", e)
      );
    }
    setSøger(false);
  }

  /* Rækkefølge og filtrering */
  const fagNr = (k) => {
    const i = FAGOMRAADER.findIndex((f) => f.navn === k);
    return i < 0 ? 99 : i;
  };
  let viste = resultat || [...aktive];
  if (filter) viste = viste.filter((p) => p.kategori === filter);
  if (!resultat) {
    viste.sort((a, b) => {
      const dA = a.dato || "";
      const dB = b.dato || "";
      const nA = a.navn || "";
      const nB = b.navn || "";
      const tie = (a.titel || "").localeCompare(b.titel || "", "da");
      let r;
      if (sortering === "navn") {
        r = nA.localeCompare(nB, "da") || dB.localeCompare(dA) || tie;
      } else if (sortering === "fag") {
        r = fagNr(a.kategori) - fagNr(b.kategori) || dB.localeCompare(dA) || tie;
      } else {
        r = dB.localeCompare(dA) || nA.localeCompare(nB, "da") || tie;
      }
      return omvendt ? -r : r;
    });
  }
  const tæller =
    resultat || filter
      ? `${viste.length} af ${aktive.length} opslag`
      : `${aktive.length} opslag`;

  return (
    <div className="vd">
      <style>{STIL}</style>

      <header className="vd-top">
        <div className="vd-top-ind">
          <h1 className="vd-mærke">
            Vidensdeling
            <span>Markedsføringsøkonom</span>
          </h1>
          {visning !== "ny" && !låst && (
            <button className="vd-del" onClick={() => setVisning("ny")}>
              + Del ny viden
            </button>
          )}
        </div>
      </header>

      <main className="vd-ind">
        {lagerfejl && !låst && (
          <div className="vd-fejl" role="alert" style={{ marginTop: 22, marginBottom: 0 }}>
            {lagerfejl}
          </div>
        )}
        {låst ? (
          <Adgangskode
            forkert={Boolean(hentKode())}
            onIndsend={(k) => {
              gemKode(k);
              return indlæs();
            }}
          />
        ) : visning === "ny" ? (
          <Formular
            navne={data.navne}
            onGem={tilføjOpslag}
            onAnnuller={() => setVisning("liste")}
            onNytNavn={tilføjNavn}
          />
        ) : visning === "papirkurv" ? (
          <section className="vd-form vd-papirkurv" style={{ maxWidth: "none" }}>
            <h2 className="vd-display">Slettede opslag</h2>
            <p className="intro">
              Slettede opslag gemmes, så de kan hentes tilbage. Gendan dem, der blev slettet
              ved en fejl.
            </p>
            {slettede.length === 0 ? (
              <p>Der er ingen slettede opslag.</p>
            ) : (
              <ul className="vd-liste" style={{ marginTop: 0 }}>
                {slettede.map((p) => (
                  <li key={p.id} className="vd-post">
                    <div className="vd-hoved">
                      <span className="d">Slettet {visDato(p.slettet)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="n">{p.navn}</span>
                    </div>
                    <h3 className="vd-titel">{p.titel}</h3>
                    <div className="vd-meta">
                      <button className="vd-slet" onClick={() => gendanOpslag(p.id)}>
                        Gendan
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="vd-handling">
              <button className="vd-annuller" onClick={() => setVisning("liste")}>
                Tilbage til kataloget
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="vd-hero">
              <h2>Hvad har du brug for?</h2>
              <div className="vd-soegerække">
                <label htmlFor="vd-soeg" className="vd-skjult">
                  Søg i kataloget
                </label>
                <input
                  id="vd-soeg"
                  type="search"
                  className="vd-soegefelt"
                  placeholder="Skriv det som en sætning — fx det du mangler til næste undervisningsgang"
                  value={søgning}
                  onChange={(e) => setSøgning(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && søg()}
                />
                <button className="vd-knap" onClick={() => søg()} disabled={søger}>
                  Søg
                </button>
                {resultat && (
                  <button
                    className="vd-annuller"
                    onClick={() => {
                      setResultat(null);
                      setSøgning("");
                      setSøgefejl("");
                    }}
                  >
                    Vis alle igen
                  </button>
                )}
              </div>
              {søger && (
                <div style={{ marginTop: 14 }}>
                  <Status tekst="Læser katalogets opslag igennem…" />
                </div>
              )}
              {søgefejl && !søger && (
                <div className="vd-fejl" role="alert" style={{ marginTop: 14 }}>
                  {søgefejl}
                </div>
              )}
              {!søger && !resultat && (
                <div className="vd-eksempler">
                  <b>Prøv</b>
                  {EKSEMPELSOEG.map((e) => (
                    <button
                      key={e}
                      className="vd-eks"
                      onClick={() => {
                        setSøgning(e);
                        søg(e);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <div className="vd-vaerktoej">
              {!resultat && (
                <div className="vd-gruppe">
                  <span className="vd-etiket">Sortér</span>
                  {[
                    ["dato", "Dato", "Nyeste først", "Ældste først"],
                    ["navn", "Navn", "A til Å", "Å til A"],
                    [
                      "fag",
                      "Fagområde",
                      `${FAGOMRAADER[0].navn} først`,
                      `${FAGOMRAADER[FAGOMRAADER.length - 1].navn} først`,
                    ],
                  ].map(([v, l, ned, op]) => (
                    <button
                      key={v}
                      className="vd-tab"
                      aria-pressed={sortering === v}
                      title={sortering === v ? (omvendt ? op : ned) : ned}
                      onClick={() => {
                        if (sortering === v) setOmvendt(!omvendt);
                        else {
                          setSortering(v);
                          setOmvendt(false);
                        }
                      }}
                    >
                      {l}
                      {sortering === v && (
                        <span className="vd-retning" aria-hidden="true">
                          {omvendt ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="vd-gruppe vd-filtre">
                <span className="vd-etiket">Filtrér</span>
                <button
                  className="vd-filter"
                  aria-pressed={filter === ""}
                  onClick={() => setFilter("")}
                >
                  Alle
                </button>
                {FAGOMRAADER.map((f) => (
                  <button
                    key={f.navn}
                    className="vd-filter"
                    aria-pressed={filter === f.navn}
                    style={{ color: filter === f.navn ? f.farve : "#1A1418" }}
                    onClick={() => vælgFilter(f.navn)}
                  >
                    <span className="vd-prik" style={{ background: f.farve }} />
                    {f.navn}
                  </button>
                ))}
              </div>
              <span className="vd-taeller">{tæller}</span>
            </div>

            {!klar ? (
              !lagerfejl && (
                <div style={{ padding: "50px 0" }}>
                  <Status tekst="Henter opslag…" />
                </div>
              )
            ) : viste.length === 0 ? (
              <div className="vd-tom">
                <h3>
                  {resultat
                    ? "Ingen af opslagene dækker det, du søger."
                    : aktive.length === 0
                    ? "Der er ingen opslag endnu."
                    : "Ingen opslag i det valgte fagområde."}
                </h3>
                <p>
                  {aktive.length === 0
                    ? "Del det første link, så bygger kataloget sig selv op."
                    : "Prøv at skrive behovet med andre ord, eller vælg Alle."}
                </p>
              </div>
            ) : (
              <ul className="vd-liste">
                {viste.map((p) => (
                  <Opslag
                    key={p.id}
                    post={p}
                    begrundelse={p.begrundelse}
                    navne={data.navne}
                    ny={p.id === nytId}
                    onSlet={sletOpslag}
                    onRet={retOpslag}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <div className="vd-fod">
        Opslag gemmes i fælles lagring — alle, der åbner siden, ser de samme opslag.
        {klar && !låst && visning !== "papirkurv" && slettede.length > 0 && (
          <>
            {" "}
            <button onClick={() => setVisning("papirkurv")}>
              Slettede opslag ({slettede.length})
            </button>
          </>
        )}
      </div>

      {besked && (
        <div className="vd-besked" role="status">
          <span>{besked.tekst}</span>
          {besked.fortryd && (
            <button onClick={() => gendanOpslag(besked.fortryd)}>Fortryd</button>
          )}
        </div>
      )}
    </div>
  );
}
