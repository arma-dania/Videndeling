// netlify/functions/ai.mjs
//
// Videresender kald til Anthropics API med nøglen på serveren.
// Nøglen sættes i Netlify under Site configuration → Environment variables
// som ANTHROPIC_API_KEY. Den må aldrig stå i koden eller i repoet.
//
// Det væsentlige: HELE anmodningen sendes videre — også "tools".
// Uden den parameter kan modellen ikke søge på nettet.

const TILLADTE_FELTER = [
  "model",
  "max_tokens",
  "messages",
  "system",
  "temperature",
  "tools",
  "tool_choice",
  "mcp_servers",
  "stop_sequences",
];

export default async (request) => {
  const svarhoved = { "Content-Type": "application/json; charset=utf-8" };

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ fejl: "Kun POST" }), {
      status: 405,
      headers: svarhoved,
    });
  }

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

  // Kopiér kun kendte felter videre — men kopiér dem alle sammen
  const krop = {};
  for (const felt of TILLADTE_FELTER) {
    if (indkommet[felt] !== undefined) krop[felt] = indkommet[felt];
  }
  if (!krop.model) krop.model = "claude-sonnet-4-6";
  if (!krop.max_tokens) krop.max_tokens = 1500;

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
