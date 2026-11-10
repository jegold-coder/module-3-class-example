// npm run ingest: read the customer PDFs in public/docs, split each page into
// short passages, embed them with Gemini and save everything to
// lib/copper/data/passages.json. The app loads that file into memory at start.
//
//   npm run ingest            embed and write the JSON (needs the Google key)
//   npm run ingest -- --dry   only split and count, no key needed
//
// This is an offline build step, so it talks to Google's embedding model
// directly instead of going through lib/ai/call.ts (which is for chat calls).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";
import { extractText, getDocumentProxy } from "unpdf";
import { EMBEDDING_MODEL } from "../lib/ai/models.ts";
import { DOCUMENTS } from "../lib/copper/documents.ts";

const DRY = process.argv.includes("--dry");
const OUT = "lib/copper/data/passages.json";

const DIMENSIONS = 768; // smaller vectors keep the JSON file small

const MIN_SENTENCES = 3;
const MAX_SENTENCES = 5;
const MIN_CHARS = 250;
const MAX_CHARS = 900;

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(•])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Groups a page's sentences into passages of a few sentences each. */
function toPassages(sentences) {
  const out = [];
  let cur = [];
  const flush = () => {
    if (cur.length) out.push(cur.join(" "));
    cur = [];
  };
  for (const s of sentences) {
    const len = cur.join(" ").length;
    if (cur.length && len + s.length > MAX_CHARS) flush();
    cur.push(s);
    const joined = cur.join(" ");
    if (
      cur.length >= MAX_SENTENCES ||
      (cur.length >= MIN_SENTENCES && joined.length >= MIN_CHARS)
    ) {
      flush();
    }
  }
  // A short leftover joins the passage before it rather than standing alone.
  const rest = cur.join(" ");
  if (rest && rest.length < 100 && out.length) out[out.length - 1] += " " + rest;
  else flush();
  return out;
}

const passages = [];
const counts = {};
for (const doc of DOCUMENTS) {
  const path = `public${doc.file}`;
  if (!existsSync(path)) {
    console.error(`Missing ${path}`);
    process.exit(1);
  }
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const { text: pages } = await extractText(pdf, { mergePages: false });
  counts[doc.title] = { pages: pages.length, passages: 0, emptyPages: 0 };
  pages.forEach((pageText, i) => {
    const chunks = toPassages(splitSentences(pageText));
    if (!chunks.length) counts[doc.title].emptyPages++;
    for (const chunk of chunks) {
      passages.push({
        id: `${doc.id}-p${i + 1}-${counts[doc.title].passages + 1}`,
        documentId: doc.id,
        title: doc.title,
        page: i + 1,
        // Starts with the document title so the embedding knows its source.
        text: `${doc.title}. ${chunk}`,
      });
      counts[doc.title].passages++;
    }
  });
}

console.log("Passages per document:");
for (const [title, c] of Object.entries(counts)) {
  const empty = c.emptyPages ? `, ${c.emptyPages} pages with no text` : "";
  console.log(`  ${title}: ${c.passages} (${c.pages} pages${empty})`);
}
console.log(`  Total: ${passages.length}`);

if (DRY) process.exit(0);

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
if (!apiKey) {
  console.error(
    "\nNo GOOGLE_GENERATIVE_AI_API_KEY in .env.local, so nothing was embedded.",
  );
  process.exit(1);
}

const google = createGoogleGenerativeAI({ apiKey });
const { embeddings } = await embedMany({
  model: google.embedding(EMBEDDING_MODEL),
  values: passages.map((p) => p.text),
  providerOptions: {
    google: { outputDimensionality: DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT" },
  },
});

const round = (v) => Math.round(v * 1e6) / 1e6;
const file = {
  model: EMBEDDING_MODEL,
  dimensions: DIMENSIONS,
  passages: passages.map((p, i) => ({
    ...p,
    embedding: embeddings[i].map(round),
  })),
};
writeFileSync(OUT, JSON.stringify(file));
console.log(
  `\nSaved ${passages.length} embedded passages to ${OUT}.`,
);
