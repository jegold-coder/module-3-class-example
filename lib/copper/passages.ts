// The embedded passages from the customer PDFs, made by `npm run ingest`.
// Importing the JSON loads it into memory once, when the server starts.
import data from "@/lib/copper/data/passages.json";

export type Passage = {
  id: string;
  documentId: string;
  title: string;
  page: number;
  /** Starts with the document title. */
  text: string;
  embedding: number[];
};

export const PASSAGES: Passage[] = data.passages as Passage[];
export const EMBEDDING_MODEL: string = data.model;
export const EMBEDDING_DIMENSIONS: number = data.dimensions;
