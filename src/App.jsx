import { useState } from "react";

/* ---------------------------------------------------------------------
   Disse to hjælpere har SAMME navne og facon som dem, artifact-versionen
   brugte (spørgClaude og window.storage). De kalder nu jeres egne
   Netlify-funktioner i stedet for Claudes indbyggede, nøglefri adgang.

   Når I flytter jeres eksisterende komponent-kode herned, skal I:
   1) Lade "spørgClaude(...)" stå som den er.
   2) Erstatte alle "window.storage.get/set/delete/list(...)" med
      "storage.get/set/delete/list(...)" (uden "window.").
--------------------------------------------------------------------- */

async function spørgClaude(indhold) {
  const res = await fetch("/.netlify/functions/ask-claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: indhold }] }),
  });
  return res.json();
}

const storage = {
  async get(key) {
    return kaldStorage("get", { key });
  },
  async set(key, value) {
    return kaldStorage("set", { key, value });
  },
  async delete(key) {
    return kaldStorage("delete", { key });
  },
  async list(prefix) {
    return kaldStorage("list", { prefix });
  },
};

async function kaldStorage(action, params) {
  const res = await fetch("/.netlify/functions/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });
  return res.json();
}

/* ---------------------------------------------------------------------
   👉 HERFRA: indsæt jeres eksisterende vidensdeling-komponent.
   Slet gerne denne midlertidige placeholder, når I gør det.
--------------------------------------------------------------------- */

export default function App() {
  const [status, setStatus] = useState("Klar");

  async function testForbindelse() {
    setStatus("Tester...");
    try {
      const svar = await spørgClaude("Svar med ét ord: virker det?");
      setStatus("AI-svar modtaget: " + JSON.stringify(svar).slice(0, 120));
    } catch (e) {
      setStatus("Fejl: " + e.message);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <h1>Videndeling</h1>
      <p>
        Dette er et tomt skelet. Indsæt jeres side-komponent her i{" "}
        <code>src/App.jsx</code>, og brug <code>storage.</code> i stedet for{" "}
        <code>window.storage.</code>.
      </p>
      <button onClick={testForbindelse}>Test AI-forbindelse</button>
      <p>{status}</p>
    </div>
  );
}
