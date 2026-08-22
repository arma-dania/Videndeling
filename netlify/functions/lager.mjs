// netlify/functions/lager.mjs
//
// Fælles lagring for alle brugere af siden, via Netlify Blobs.
// Erstatter det window.storage, der kun findes inde i Claude.
//
// Kræver at pakken @netlify/blobs står i package.json under dependencies.

import { getStore } from "@netlify/blobs";

const BUTIK = "vidensdeling";

export default async (request) => {
  const svarhoved = { "Content-Type": "application/json; charset=utf-8" };

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ fejl: "Kun POST" }), {
      status: 405,
      headers: svarhoved,
    });
  }

  let krop;
  try {
    krop = await request.json();
  } catch {
    return new Response(JSON.stringify({ fejl: "Ugyldig JSON" }), {
      status: 400,
      headers: svarhoved,
    });
  }

  const { handling, noegle, vaerdi, praefiks } = krop;

  try {
    // consistency: "strong" sikrer at en kollega ser ændringen med det samme
    const butik = getStore({ name: BUTIK, consistency: "strong" });

    if (handling === "get") {
      const v = await butik.get(noegle);
      return new Response(JSON.stringify({ noegle, vaerdi: v ?? null }), {
        status: 200,
        headers: svarhoved,
      });
    }

    if (handling === "set") {
      await butik.set(noegle, String(vaerdi));
      return new Response(JSON.stringify({ noegle, gemt: true }), {
        status: 200,
        headers: svarhoved,
      });
    }

    if (handling === "delete") {
      await butik.delete(noegle);
      return new Response(JSON.stringify({ noegle, slettet: true }), {
        status: 200,
        headers: svarhoved,
      });
    }

    if (handling === "list") {
      const { blobs } = await butik.list({ prefix: praefiks || "" });
      return new Response(
        JSON.stringify({ noegler: (blobs || []).map((b) => b.key) }),
        { status: 200, headers: svarhoved }
      );
    }

    return new Response(JSON.stringify({ fejl: "Ukendt handling" }), {
      status: 400,
      headers: svarhoved,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ fejl: "Lagerfejl", detalje: String(e) }),
      { status: 500, headers: svarhoved }
    );
  }
};
