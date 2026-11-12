import { describe, it, expect } from "vitest";
import type { ManageMaterialsOperation } from "../../schemas";
import {
  parsePaths,
  pathsOverlap,
  isPathWithin,
  collectLockedPaths,
  isPathLocked,
} from "./manageMaterialsLocks";

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

describe("pathsOverlap", () => {
  it("matches identical paths case-insensitively and ignoring trailing slashes", () => {
    expect(pathsOverlap("netapp/Interviews/", "netapp/interviews")).toBe(true);
  });

  it("matches a parent and a child folder in either order", () => {
    expect(pathsOverlap("netapp/Interviews/", "netapp/Interviews/Sub/")).toBe(
      true,
    );
    expect(pathsOverlap("netapp/Interviews/Sub/", "netapp/Interviews/")).toBe(
      true,
    );
  });

  it("matches a file inside a folder", () => {
    expect(
      pathsOverlap("netapp/Interviews/file.pdf", "netapp/Interviews/"),
    ).toBe(true);
  });

  it("does not match siblings that share a name prefix", () => {
    expect(pathsOverlap("netapp/Interviews/", "netapp/Interviews v2/")).toBe(
      false,
    );
  });

  it("does not match unrelated paths", () => {
    expect(pathsOverlap("netapp/a/", "netapp/b/")).toBe(false);
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
});

describe("collectLockedPaths", () => {
  const operation = (
    sourcePaths: string,
    destinationPaths: string | null,
  ): ManageMaterialsOperation => ({
    id: "op",
    operationType: "BatchCopy",
    sourcePaths,
    destinationPaths,
    userName: "user",
    createdAt: "2026-01-01T00:00:00Z",
  });

  it("returns an empty array when there are no operations", () => {
    expect(collectLockedPaths([])).toEqual([]);
  });

  it("collects source and destination paths from every operation", () => {
    expect(
      collectLockedPaths([
        operation('["netapp/a/"]', '["netapp/b/"]'),
        operation('["netapp/c/file.pdf"]', null),
      ]),
    ).toEqual(["netapp/a/", "netapp/b/", "netapp/c/file.pdf"]);
  });
});

describe("isPathLocked", () => {
  const lockedPaths = ["netapp/a/", "netapp/b/c/"];

  it("is true for a locked path, its children and its parents", () => {
    expect(isPathLocked("netapp/a/", lockedPaths)).toBe(true);
    expect(isPathLocked("netapp/a/file.pdf", lockedPaths)).toBe(true);
    expect(isPathLocked("netapp/b/", lockedPaths)).toBe(true);
  });

  it("is false for unrelated paths", () => {
    expect(isPathLocked("netapp/d/", lockedPaths)).toBe(false);
  });

  it("is false when nothing is locked", () => {
    expect(isPathLocked("netapp/a/", [])).toBe(false);
  });
});
