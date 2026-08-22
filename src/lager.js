// src/lager.js
//
// Giver appen et "storage", der opfører sig som det window.storage,
// koden blev skrevet til inde i Claude. Alt ligger i fælles lagring,
// så alle kolleger ser det samme katalog.
//
// Bruges i App.jsx med linjen:
//     import { storage } from "./lager.js";

async function kald(krop) {
  const svar = await fetch("/.netlify/functions/lager", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(krop),
  });
  if (!svar.ok) {
    throw new Error(`Lagerfejl ${svar.status}`);
  }
  return svar.json();
}

export const storage = {
  // Kaster en fejl hvis nøglen ikke findes — præcis som i Claude
  async get(noegle) {
    const d = await kald({ handling: "get", noegle });
    if (d.vaerdi == null) throw new Error(`Nøglen findes ikke: ${noegle}`);
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
