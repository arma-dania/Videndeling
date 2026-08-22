import React, { useState, useEffect, useRef } from "react";
import { storage } from "./lager.js";
/* ------------------------------------------------------------------ */
/*  Data og konstanter                                                 */
/* ------------------------------------------------------------------ */

const NOEGLE = "vidensdeling:v1";

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

const TYPER = ["Dokument", "Podcast", "Video"];

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
  if (/youtube|youtu\.be|vimeo|\.mp4|video/.test(u)) return "Video";
  if (/spotify|podcast|soundcloud|apple\.com\/.*podcast|\.mp3|anchor\.fm/.test(u))
    return "Podcast";
  return "Dokument";
}

function pænUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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
      `/.netlify/functions/hent-side?url=${encodeURIComponent(url)}`
    );
    if (!svar.ok) return null;
    const d = await svar.json();
    return d && d.tekst && d.tekst.length > 200 ? d : null;
  } catch {
    return null;
  }
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
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{ role: "user", content: indhold }],
  };
  if (brugWebsøgning) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }
  const svar = await fetch("/.netlify/functions/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await svar.json();
  if (!data || !Array.isArray(data.content)) throw new Error("Uventet svar");
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/*  Delt lagring                                                       */
/* ------------------------------------------------------------------ */

let hukommelse = { opslag: [], navne: STANDARDNAVNE };

async function hentData() {
  if (!storage) return hukommelse;
  try {
    const r = await storage.get(NOEGLE, true);
    if (r && r.value) {
      const d = JSON.parse(r.value);
      return {
        opslag: d.opslag || [],
        navne: d.navne && d.navne.length ? d.navne : STANDARDNAVNE,
      };
    }
  } catch {
    /* nøglen findes ikke endnu */
  }
  return { opslag: [], navne: STANDARDNAVNE };
}

async function gemData(opdater) {
  const nuværende = await hentData();
  const næste = opdater(nuværende);
  hukommelse = næste;
  if (storage) {
    await storage.set(NOEGLE, JSON.stringify(næste), true);
  }
  return næste;
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
.vd button { font:inherit; cursor:pointer; border:none; background:none; color:inherit; }
.vd input,.vd select,.vd textarea { font:inherit; color:inherit; }
.vd :focus-visible { outline:2px solid var(--rod); outline-offset:2px; border-radius:2px; }

.vd-display { font-family:"Bricolage Grotesque",system-ui,sans-serif; letter-spacing:-0.02em; }
.vd-mono { font-family:"IBM Plex Mono",ui-monospace,monospace; }

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
.vd-soegefelt::placeholder { color:#A79BA0; }
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
.vd-tab[aria-pressed="true"] { background:var(--blaek); color:#fff; }
.vd-retning { margin-left:6px; font-size:12px; opacity:.85; }
.vd-filter { font-size:13.5px; padding:5px 12px; border-radius:999px;
  border:1px solid var(--linje); display:inline-flex; align-items:center; gap:7px; }
.vd-prik { width:8px; height:8px; border-radius:50%; flex:none; }
.vd-filter[aria-pressed="true"] { border-color:currentColor; font-weight:600; }
.vd-taeller { margin-left:auto; font-family:"IBM Plex Mono",monospace; font-size:12px; color:var(--graa); }

/* Opslag */
.vd-liste { list-style:none; margin:24px 0 0; padding:0;
  display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; align-items:start; }
.vd-post { border:1px solid var(--linje); border-radius:5px; padding:20px 20px 16px; background:#fff; }
.vd-hoved { font-family:"IBM Plex Mono",monospace; font-size:12px; line-height:1.5;
  display:flex; gap:9px; flex-wrap:wrap; margin-bottom:10px; }
.vd-hoved .d { color:var(--graa); }
.vd-hoved .n { color:var(--rod); text-transform:uppercase; letter-spacing:.06em; word-break:break-word; }
.vd-titel { font-family:"Bricolage Grotesque",system-ui,sans-serif; font-weight:600;
  font-size:18px; letter-spacing:-0.02em; line-height:1.3; margin:0 0 8px; }
.vd-titel a { color:inherit; text-decoration:none; background-image:linear-gradient(currentColor,currentColor);
  background-size:0% 1.5px; background-repeat:no-repeat; background-position:0 100%; transition:background-size .2s; }
.vd-titel a:hover { background-size:100% 1.5px; }
.vd-resume { color:#40383D; font-size:14.5px; margin:0; }
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
.vd-hjaelp { display:block; margin-top:7px; font-size:13px; color:var(--graa);
  font-family:system-ui,sans-serif; letter-spacing:0; text-transform:none; }
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

@media (max-width:760px) {
  .vd-liste { grid-template-columns:1fr; }
}
@media (max-width:620px) {
  .vd-todelt { grid-template-columns:1fr; }
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
    <div className="vd-status">
      <div className="vd-spinner" />
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

function Opslag({ post, begrundelse, navne, onSlet, onRet }) {
  const [bekræft, setBekræft] = useState(false);
  const [udkast, setUdkast] = useState(null);
  const [åben, setÅben] = useState(false);
  const [kanFoldes, setKanFoldes] = useState(false);
  const førsteFelt = useRef(null);
  const resumeRef = useRef(null);

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
          <label className="vd-mark">
            <span>Link</span>
            <input
              className="vd-input"
              value={udkast.url}
              onChange={(e) => setUdkast({ ...udkast, url: e.target.value })}
            />
          </label>
          <div className="vd-handling" style={{ marginTop: 4 }}>
            <button
              className="vd-knap"
              onClick={() => {
                onRet({ ...post, ...udkast });
                setUdkast(null);
              }}
            >
              Gem ændringer
            </button>
            <button className="vd-annuller" onClick={() => setUdkast(null)}>
              Fortryd
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="vd-post">
      <div className="vd-hoved">
        <span className="d">{visDato(post.dato)}</span>
        <span aria-hidden="true">·</span>
        <span className="n">{post.navn}</span>
      </div>
      <h3 className="vd-titel">
        <a href={post.url} target="_blank" rel="noopener noreferrer">
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
                  url: post.url,
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
/*  Formular                                                           */
/* ------------------------------------------------------------------ */

function Formular({ navne, onGem, onAnnuller, onNytNavn }) {
  const [url, setUrl] = useState("");
  const [navn, setNavn] = useState(navne[0] || "");
  const [dato, setDato] = useState(idag());
  const [note, setNote] = useState("");
  const [transskription, setTransskription] = useState("");
  const [fil, setFil] = useState(null);
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
    if (!url.trim()) return setFejl("Indsæt et link til det, du vil dele.");
    if (!navn) return setFejl("Vælg dit navn på listen.");
    setArbejder(true);

    let tekstKilde = transskription.trim().slice(0, 12000);
    const yt = await hentYouTubeInfo(url.trim());

    /* Er der hverken fil eller indsat tekst, så prøv at hente siden på serveren */
    let side = null;
    if (!fil && !tekstKilde && !BAG_LOGIN.test(url)) {
      side = await hentSideTekst(url.trim());
      if (side) tekstKilde = side.tekst.slice(0, 12000);
    }

    const kilde = fil
      ? `Kollegaen har vedhæftet selve filen (${fil.name}). Byg titel, fagområde og opsummering på filens faktiske indhold.`
      : tekstKilde
      ? `Nedenfor står teksten fra kilden. Byg opsummeringen på den — det er dit primære grundlag. Søg ikke. Teksten er hentet råt fra en webside, så se bort fra menupunkter, cookiebeskeder, kontaktoplysninger og gentagelser.`
      : `Slå linket op på nettet, hvis siden er offentligt tilgængelig. Søg højst én gang. Kan du ikke komme ind — fordi siden kræver login, eller fordi indholdet er en video eller podcast, du hverken kan se eller høre — så find aldrig på indhold. Skriv i stedet en opsummering, der bygger på kollegaens note, og indled den med "Kunne ikke læses automatisk."`;

    const opgave = `Du hjælper undervisere på Markedsføringsøkonom-uddannelsen på et dansk erhvervsakademi med at katalogisere delt viden.

Link: ${url.trim()}${
      yt
        ? `\nKildens rigtige titel: "${yt.titel}"${yt.kanal ? ` (kanal: ${yt.kanal})` : ""}`
        : side && side.titel
        ? `\nSidens egen titel: "${side.titel}"`
        : ""
    }
Kollegaens egen note: ${note.trim() || "(ingen)"}

${kilde}
${tekstKilde ? `\nTekst fra kilden:\n"""\n${tekstKilde}\n"""\n` : ""}
Svar KUN med JSON. Skriv intet før og intet efter — ingen indledning, ingen markdown:
{"titel":"kort sigende titel på dansk, max 12 ord","kategori":"et af: ${FAGLISTE}","type":"et af: Dokument, Podcast, Video","opsummering":"2-3 sætninger på dansk i almindeligt sprog, der fortæller en underviser hvad det handler om, og hvad det kan bruges til"}`;

    try {
      let indhold = opgave;
      if (fil) {
        const b64 = await læsSomBase64(fil);
        const blok =
          fil.type === "application/pdf"
            ? {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: b64 },
              }
            : {
                type: "image",
                source: { type: "base64", media_type: fil.type, data: b64 },
              };
        indhold = [blok, { type: "text", text: opgave }];
      }
      const brugSøgning = !fil && !tekstKilde;
      let svar = await spørgClaude(indhold, brugSøgning);
      let j = udtrækJson(svar);
      if (!j && brugSøgning) {
        // websøgningen brugte svaret op — prøv igen uden den
        svar = await spørgClaude(opgave, false);
        j = udtrækJson(svar);
      }
      j = j || {};
      setUdkast({
        titel: j.titel || (yt && yt.titel) || (side && side.titel) || pænUrl(url),
        kategori: FAGOMRAADER.some((f) => f.navn === j.kategori)
          ? j.kategori
          : "Markedsføring",
        type: TYPER.includes(j.type) ? j.type : gætType(url),
        opsummering: j.opsummering || note.trim() || "",
      });
      if (!j.opsummering) {
        setFejl(
          "AI'en kunne ikke få fat i indholdet. Indsæt transskriptionen eller en beskrivelse, eller skriv opsummeringen selv nedenfor."
        );
      }
    } catch {
      setUdkast({
        titel: (yt && yt.titel) || pænUrl(url),
        kategori: "Markedsføring",
        type: gætType(url),
        opsummering: note.trim() || "",
      });
      setFejl("AI'en kunne ikke læse kilden. Skriv selv titel og opsummering nedenfor.");
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
        {fejl && <div className="vd-fejl">{fejl}</div>}
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
            onClick={() =>
              onGem({
                id: `p${Date.now()}${Math.floor(Math.random() * 999)}`,
                url: url.trim(),
                navn,
                dato,
                ...udkast,
              })
            }
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
      {fejl && <div className="vd-fejl">{fejl}</div>}

      <label className="vd-mark">
        <span>Link til dokument, podcast eller video</span>
        <input
          className="vd-input"
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>

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
        <span>Vedhæft filen — så kan AI'en læse den</span>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="vd-input vd-filfelt"
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return setFil(null);
            if (f.size > 20 * 1024 * 1024) {
              setFil(null);
              setFejl("Filen er over 20 MB. Skriv en note i stedet.");
              return;
            }
            setFejl("");
            setFil(f);
          }}
        />
        <span className="vd-hjaelp">
          {fil
            ? `${fil.name} følger med til analysen. Filen bliver ikke gemt — kun linket.`
            : "PDF eller billede. Linket er stadig det, kollegerne klikker på."}
        </span>
      </label>

      {!fil && BAG_LOGIN.test(url) && (
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

      {!fil && !transskription.trim() && ER_YOUTUBE.test(url) && (
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
              fil
                ? "Læser den vedhæftede fil…"
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

  useEffect(() => {
    hentData().then((d) => {
      setData(d);
      setKlar(true);
    });
  }, []);

  const opdater = async (fn) => setData(await gemData(fn));

  const tilføjOpslag = async (post) => {
    await opdater((d) => ({ ...d, opslag: [post, ...d.opslag] }));
    setVisning("liste");
    setResultat(null);
    setSøgning("");
  };

  const retOpslag = async (post) => {
    await opdater((d) => ({
      ...d,
      opslag: d.opslag.map((p) => (p.id === post.id ? { ...p, ...post } : p)),
    }));
    setResultat((r) =>
      r ? r.map((x) => (x.id === post.id ? { ...x, ...post } : x)) : r
    );
  };

  const sletOpslag = async (id) => {
    await opdater((d) => ({ ...d, opslag: d.opslag.filter((p) => p.id !== id) }));
    setResultat((r) => (r ? r.filter((x) => x.id !== id) : r));
  };

  const tilføjNavn = (n) =>
    opdater((d) => (d.navne.includes(n) ? d : { ...d, navne: [...d.navne, n].sort() }));

  const vælgFilter = (k) => setFilter((f) => (f === k ? "" : k));

  async function søg() {
    const q = søgning.trim();
    setSøgefejl("");
    if (!q) return setResultat(null);
    if (data.opslag.length === 0) return setSøgefejl("Der er ingen opslag at søge i endnu.");
    setSøger(true);
    const katalog = data.opslag.map((p) => ({
      id: p.id,
      titel: p.titel,
      kategori: p.kategori,
      navn: p.navn,
      dato: p.dato,
      opsummering: p.opsummering,
    }));
    const prompt = `Du er søgefunktion i et videndelingskatalog for undervisere på en dansk markedsføringsøkonom-uddannelse.

Kollegaen skriver hvad hun har brug for, i almindeligt sprog. Find de opslag der reelt dækker behovet — også når ordene ikke er de samme. Tag kun opslag med, der faktisk er relevante; er der ingen, så returnér en tom liste.

Behov: "${q}"

Katalog:
${JSON.stringify(katalog)}

Svar KUN med JSON, uden markdown:
[{"id":"opslagets id","begrundelse":"én kort sætning på dansk om hvorfor netop dette hjælper på behovet"}]
Sortér med det mest relevante først. Højst 8 resultater.`;

    try {
      const tekst = await spørgClaude(prompt, false);
      const j = udtrækJson(tekst);
      if (!Array.isArray(j)) throw new Error("format");
      const map = new Map(data.opslag.map((p) => [p.id, p]));
      setResultat(
        j.map((r) => ({ ...map.get(r.id), begrundelse: r.begrundelse })).filter((r) => r.id)
      );
    } catch {
      const ord = q.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      setResultat(
        data.opslag.filter((p) =>
          ord.some((w) => `${p.titel} ${p.opsummering} ${p.kategori}`.toLowerCase().includes(w))
        )
      );
      setSøgefejl("AI-søgningen svarede ikke. Nedenfor er en almindelig tekstsøgning i stedet.");
    }
    setSøger(false);
  }

  /* Rækkefølge og filtrering */
  const fagNr = (k) => {
    const i = FAGOMRAADER.findIndex((f) => f.navn === k);
    return i < 0 ? 99 : i;
  };
  let viste = resultat || [...data.opslag];
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

  return (
    <div className="vd">
      <style>{STIL}</style>

      <header className="vd-top">
        <div className="vd-top-ind">
          <h1 className="vd-mærke">
            Vidensdeling
            <span>Markedsføringsøkonom</span>
          </h1>
          {visning === "liste" && (
            <button className="vd-del" onClick={() => setVisning("ny")}>
              + Del ny viden
            </button>
          )}
        </div>
      </header>

      <main className="vd-ind">
        {visning === "ny" ? (
          <Formular
            navne={data.navne}
            onGem={tilføjOpslag}
            onAnnuller={() => setVisning("liste")}
            onNytNavn={tilføjNavn}
          />
        ) : (
          <>
            <section className="vd-hero">
              <h2>Hvad har du brug for?</h2>
              <div className="vd-soegerække">
                <input
                  className="vd-soegefelt"
                  placeholder="Skriv det som en sætning — fx det du mangler til næste undervisningsgang"
                  value={søgning}
                  onChange={(e) => setSøgning(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && søg()}
                />
                <button className="vd-knap" onClick={søg} disabled={søger}>
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
                <div className="vd-fejl" style={{ marginTop: 14 }}>
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
              <div className="vd-gruppe">
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
              <span className="vd-taeller">
                {viste.length} {viste.length === 1 ? "opslag" : "opslag"}
              </span>
            </div>

            {!klar ? (
              <div style={{ padding: "50px 0" }}>
                <Status tekst="Henter opslag…" />
              </div>
            ) : viste.length === 0 ? (
              <div className="vd-tom">
                <h3>
                  {resultat
                    ? "Ingen af opslagene dækker det, du søger."
                    : data.opslag.length === 0
                    ? "Der er ingen opslag endnu."
                    : "Ingen opslag i det valgte fagområde."}
                </h3>
                <p>
                  {data.opslag.length === 0
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
        Opslag gemmes i fælles lagring — alle, der åbner siden, ser de samme opslag og kan
        slette dem.
      </div>
    </div>
  );
}
