// netlify/lib/adgang.mjs
//
// Fælles adgangskode for alle funktionerne. Sættes i Netlify under
// Site configuration → Environment variables som VIDENDELING_KODE.
// Er variablen ikke sat, er funktionerne åbne som før.
//
// Browseren sender koden URI-kodet i headeren X-Vidensdeling-Kode,
// så æ, ø og å kan indgå i koden.

import { timingSafeEqual } from "node:crypto";

export function adgangNægtet(request) {
  const kode = process.env.VIDENDELING_KODE;
  if (!kode) return null;

  let givet = "";
  try {
    givet = decodeURIComponent(request.headers.get("x-vidensdeling-kode") || "");
  } catch {
    givet = "";
  }

  const a = Buffer.from(givet);
  const b = Buffer.from(kode);
  if (a.length === b.length && timingSafeEqual(a, b)) return null;

  return new Response(JSON.stringify({ fejl: "Forkert eller manglende adgangskode" }), {
    status: 401,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
