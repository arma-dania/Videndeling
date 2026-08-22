// Erstatter window.storage (som kun findes inde i en Claude-artifact) med en
// rigtig, fælles database. Netlify Blobs er en indbygget nøgle-værdi-database,
// der følger med jeres Netlify-hosting uden ekstra opsætning.

const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Kun POST er tilladt" };
  }

  try {
    const store = getStore("vidensdeling");
    const { action, key, value, prefix } = JSON.parse(event.body || "{}");

    if (action === "get") {
      const val = await store.get(key);
      return json({ key, value: val ?? null });
    }

    if (action === "set") {
      await store.set(key, value);
      return json({ key, value });
    }

    if (action === "delete") {
      await store.delete(key);
      return json({ key, deleted: true });
    }

    if (action === "list") {
      const { blobs } = await store.list({ prefix: prefix || "" });
      return json({ keys: blobs.map((b) => b.key) });
    }

    return { statusCode: 400, body: "Ukendt handling: " + action };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

function json(obj) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
