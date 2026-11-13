import { describe, it, expect } from "vitest";
import { parsePaths, isPathWithin } from "./manageMaterialsPaths";

describe("parsePaths", () => {
  it("returns an empty array for null, undefined or empty input", () => {
    expect(parsePaths(null)).toEqual([]);
    expect(parsePaths(undefined)).toEqual([]);
    expect(parsePaths("")).toEqual([]);
  });

  it("parses a JSON array of paths", () => {
    expect(parsePaths('["netapp/a/", "netapp/b/"]')).toEqual([
      "netapp/a/",
      "netapp/b/",
    ]);
  });

  it("returns an empty array for invalid or non-array JSON", () => {
    expect(parsePaths("not json")).toEqual([]);
    expect(parsePaths('{"foo":"bar"}')).toEqual([]);
  });

  it("ignores non-string entries", () => {
    expect(parsePaths('["netapp/a/", 1, null]')).toEqual(["netapp/a/"]);
  });
});

describe("isPathWithin", () => {
  it("is true for the same path and for descendants", () => {
    expect(isPathWithin("netapp/a/", "netapp/A")).toBe(true);
    expect(isPathWithin("netapp/a/b/", "netapp/a/")).toBe(true);
  });

  it("is false for a parent or a sibling", () => {
    expect(isPathWithin("netapp/", "netapp/a/")).toBe(false);
    expect(isPathWithin("netapp/ab/", "netapp/a/")).toBe(false);
  });

  it("does not match siblings that share a name prefix", () => {
    expect(isPathWithin("netapp/Interviews v2/", "netapp/Interviews/")).toBe(
      false,
    );
  });
});
