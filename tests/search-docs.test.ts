// search_docs: finds the 5 passages closest to the question. The embedding of
// the question is mocked, so this test needs no AI key and costs nothing.
import { describe, expect, it, vi } from "vitest";
import { PASSAGES } from "@/lib/copper/passages";

const embed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/call", () => ({
  callEmbed: embed,
  isAiConfigured: () => true,
}));

import { copperTools, searchDocs } from "@/lib/copper/assistant/tools";

describe("search_docs", () => {
  it("is one of Ask Copper's tools", () => {
    expect(Object.keys(copperTools)).toContain("search_docs");
  });

  it("returns the 5 closest passages with title, page and a link to that page", async () => {
    const target = PASSAGES[10];
    embed.mockResolvedValue([target.embedding]);
    const found = await searchDocs({ query: "anything" });
    if (found.status !== "ok") throw new Error("expected results");
    expect(found.results).toHaveLength(5);
    const first = found.results[0];
    expect(first.title).toBe(target.title);
    expect(first.page).toBe(target.page);
    expect(first.url).toMatch(/^\/docs\/[a-z-]+\.pdf#page=\d+$/);
    expect(first.url.endsWith(`#page=${target.page}`)).toBe(true);
    expect(first.text.startsWith(target.title)).toBe(false);
  });
});
