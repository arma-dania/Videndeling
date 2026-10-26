// src/lager.js
//
// Giver appen et "storage", der opfører sig som det window.storage,
// koden blev skrevet til inde i Claude. Alt ligger i fælles lagring,
// så alle kolleger ser det samme katalog.
//
// Bruges i App.jsx med linjen:
//     import { storage } from "./lager.js";

/* ------------------------------------------------------------------ */
/*  Fælles adgangskode                                                 */
/* ------------------------------------------------------------------ */

const KODENOEGLE = "vidensdeling:kode";
let kodeIHukommelsen = "";

export function hentKode() {
  try {
    return localStorage.getItem(KODENOEGLE) || kodeIHukommelsen;
  } catch {
    return kodeIHukommelsen;
  }
}

export function gemKode(kode) {
  kodeIHukommelsen = kode;
  try {
    localStorage.setItem(KODENOEGLE, kode);
  } catch {
    /* privat vindue o.l. — koden huskes så kun, til siden lukkes */
  }
}

// Headeren skal være ren ASCII, så koden URI-kodes (æ, ø, å)
export function adgangshoveder() {
  const k = hentKode();
  return k ? { "X-Vidensdeling-Kode": encodeURIComponent(k) } : {};
}

/* ------------------------------------------------------------------ */
/*  Lagring                                                            */
/* ------------------------------------------------------------------ */

async function kald(krop) {
  const svar = await fetch("/.netlify/functions/lager", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adgangshoveder() },
    body: JSON.stringify(krop),
  });
  if (!svar.ok) {
    const fejl = new Error(`Lagerfejl ${svar.status}`);
    fejl.status = svar.status;
    throw fejl;
  }
  return svar.json();
}

export const storage = {
  // Kaster en fejl hvis nøglen ikke findes — præcis som i Claude.
  // Fejlen er markeret med fandtesIkke, så den kan skelnes fra en
  // egentlig lagerfejl.
  async get(noegle) {
    const d = await kald({ handling: "get", noegle });
    if (d.vaerdi == null) {
      const fejl = new Error(`Nøglen findes ikke: ${noegle}`);
      fejl.fandtesIkke = true;
      throw fejl;
    }
    return { key: noegle, value: d.vaerdi, shared: true };
  },

  async set(noegle, vaerdi) {
    await kald({ handling: "set", noegle, vaerdi: String(vaerdi) });
    return { key: noegle, value: vaerdi, shared: true };
  },

  async delete(noegle) {
    await kald({ handling: "delete", noegle });
    return { key: noegle, deleted: true, shared: true };
  },

  async list(praefiks = "") {
    const d = await kald({ handling: "list", praefiks });
    return { keys: d.noegler || [], prefix: praefiks, shared: true };
  },
};

export default storage;
