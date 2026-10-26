// netlify/functions/ai.mjs
//
// Videresender kald til Anthropics API med nøglen på serveren.
// Nøglen sættes i Netlify under Site configuration → Environment variables
// som ANTHROPIC_API_KEY. Den må aldrig stå i koden eller i repoet.
//
// Model, loft over svarlængde og værktøjer bestemmes her på serveren —
// ikke af browseren — så endepunktet ikke kan bruges til hvad som helst
// på jeres regning. Det eneste værktøj, browseren kan bede om, er websøgning.

import { adgangNægtet } from "../lib/adgang.mjs";

const MODEL = "claude-sonnet-4-6";
const MAKS_TOKENS = 1500;
const WEBSØGNING = { type: "web_search_20250305", name: "web_search", max_uses: 3 };

export default async (request) => {
  const svarhoved = { "Content-Type": "application/json; charset=utf-8" };

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ fejl: "Kun POST" }), {
      status: 405,
      headers: svarhoved,
    });
  }

  const nægtet = adgangNægtet(request);
  if (nægtet) return nægtet;

  const nøgle = process.env.ANTHROPIC_API_KEY;
  if (!nøgle) {
    return new Response(
      JSON.stringify({
        fejl: "ANTHROPIC_API_KEY mangler. Sæt den i Netlify under Environment variables.",
      }),
      { status: 500, headers: svarhoved }
    );
  }

  let indkommet;
  try {
    indkommet = await request.json();
  } catch {
    return new Response(JSON.stringify({ fejl: "Ugyldig JSON" }), {
      status: 400,
      headers: svarhoved,
    });
  }

  if (!Array.isArray(indkommet.messages) || indkommet.messages.length === 0) {
    return new Response(JSON.stringify({ fejl: "Mangler messages" }), {
      status: 400,
      headers: svarhoved,
    });
  }

  const ønsket = Number(indkommet.max_tokens) || 1000;
  const krop = {
    model: MODEL,
    max_tokens: Math.min(Math.max(ønsket, 1), MAKS_TOKENS),
    messages: indkommet.messages,
  };
  const vilSøge =
    Array.isArray(indkommet.tools) &&
    indkommet.tools.some((t) => t && String(t.type || "").startsWith("web_search"));
  if (vilSøge) krop.tools = [WEBSØGNING];

  try {
    const svar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": nøgle,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(krop),
    });

    const tekst = await svar.text();

    // Send API'ets eget svar og statuskode videre, så fejl kan ses i browseren
    return new Response(tekst, { status: svar.status, headers: svarhoved });
  } catch (e) {
    return new Response(
      JSON.stringify({ fejl: "Kunne ikke nå Anthropics API", detalje: String(e) }),
      { status: 502, headers: svarhoved }
    );
  }
};
