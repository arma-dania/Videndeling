// Denne funktion kører på serveren (ikke i browseren), så jeres API-nøgle
// aldrig bliver synlig for besøgende på siden. Frontend kalder denne funktion
// i stedet for at kalde Anthropic direkte.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Kun POST er tilladt" };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "ANTHROPIC_API_KEY mangler. Tilføj den under Site settings > Environment variables i Netlify.",
      }),
    };
  }

  try {
    const { messages, tools, max_tokens } = JSON.parse(event.body || "{}");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: max_tokens || 1000,
        messages,
        ...(tools ? { tools } : {}),
      }),
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
