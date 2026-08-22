// netlify/functions/hent-side.js
//
// Henter en offentlig webside på serveren og returnerer den som ren tekst.
// Browseren må ikke selv hente fremmede sider (CORS), men det må serveren.
//
// Kaldes som:  /.netlify/functions/hent-side?url=https://eksempel.dk/side
// Svarer med:  { titel, beskrivelse, tekst }

const MAKS_TEGN = 15000;

/* Simpel værn mod at endepunktet bruges til at nå interne adresser */
function erTilladt(u) {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const v = u.hostname.toLowerCase();
  if (v === "localhost" || v.endsWith(".local") || v.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) {
    const [a, b] = v.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
  }
  return true;
}

function findMeta(html, navn) {
  const m =
    html.match(
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${navn}["'][^>]+content=["']([^"']*)["']`,
        "i"
      )
    ) ||
    html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${navn}["']`,
        "i"
      )
    );
  return m ? m[1].trim() : "";
}

function afkod(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&aelig;/gi, "æ")
    .replace(/&oslash;/gi, "ø")
    .replace(/&aring;/gi, "å")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function tilTekst(html) {
  return afkod(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\r\f]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export default async (request) => {
  const svarhoved = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  };

  const adresse = new URL(request.url).searchParams.get("url");
  if (!adresse) {
    return new Response(JSON.stringify({ fejl: "Mangler url" }), {
      status: 400,
      headers: svarhoved,
    });
  }

  let mål;
  try {
    mål = new URL(adresse);
  } catch {
    return new Response(JSON.stringify({ fejl: "Ugyldig url" }), {
      status: 400,
      headers: svarhoved,
    });
  }
  if (!erTilladt(mål)) {
    return new Response(JSON.stringify({ fejl: "Adressen er ikke tilladt" }), {
      status: 400,
      headers: svarhoved,
    });
  }

  try {
    const afbryd = AbortSignal.timeout(12000);
    const side = await fetch(mål.toString(), {
      signal: afbryd,
      redirect: "follow",
      headers: {
        // Nogle sider afviser kald uden en almindelig browserprofil
        "User-Agent":
          "Mozilla/5.0 (compatible; Vidensdeling/1.0; +https://netlify.app)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "da,en;q=0.8",
      },
    });

    if (!side.ok) {
      return new Response(
        JSON.stringify({ fejl: `Siden svarede ${side.status}` }),
        { status: 200, headers: svarhoved }
      );
    }

    const type = side.headers.get("content-type") || "";
    if (!type.includes("html") && !type.includes("text/plain")) {
      return new Response(
        JSON.stringify({ fejl: "Indholdet er ikke en webside" }),
        { status: 200, headers: svarhoved }
      );
    }

    const html = await side.text();
    const titelTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

    return new Response(
      JSON.stringify({
        titel: findMeta(html, "og:title") || (titelTag ? afkod(titelTag[1].trim()) : ""),
        beskrivelse:
          findMeta(html, "og:description") || findMeta(html, "description"),
        tekst: tilTekst(html).slice(0, MAKS_TEGN),
      }),
      { status: 200, headers: svarhoved }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ fejl: "Kunne ikke hente siden" }),
      { status: 200, headers: svarhoved }
    );
  }
};
