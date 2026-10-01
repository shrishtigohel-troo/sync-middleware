import { describe, it, expect } from "vitest";
import { paginate } from "../../src/shopify/pagination.js";

describe("paginate", () => {
  it("yields every node across multiple pages in order", async () => {
    const pages = {
      start: {
        edges: [
          { node: "a", cursor: "1" },
          { node: "b", cursor: "2" },
        ],
        pageInfo: { hasNextPage: true, endCursor: "2" },
      },
      "2": {
        edges: [{ node: "c", cursor: "3" }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    };

    const fetchPage = async (cursor) => pages[cursor ?? "start"];

    const results = [];
    for await (const node of paginate(fetchPage)) {
      results.push(node);
    }

    expect(results).toEqual(["a", "b", "c"]);
  });

  it("stops after a single page when hasNextPage is false", async () => {
    const fetchPage = async () => ({
      edges: [{ node: "only", cursor: "1" }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    const results = [];
    for await (const node of paginate(fetchPage)) {
      results.push(node);
    }

    expect(results).toEqual(["only"]);
  });

  it("yields nothing for an empty connection", async () => {
    const fetchPage = async () => ({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    const results = [];
    for await (const node of paginate(fetchPage)) {
      results.push(node);
    }

    expect(results).toEqual([]);
  });
});
