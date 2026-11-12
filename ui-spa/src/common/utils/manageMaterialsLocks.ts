import type { ManageMaterialsOperation } from "../../schemas";

export const parsePaths = (jsonStr: string | null | undefined): string[] => {
  if (!jsonStr) return [];
  try {
    const parsed: unknown = JSON.parse(jsonStr);
    return Array.isArray(parsed)
      ? parsed.filter((path): path is string => typeof path === "string")
      : [];
  } catch {
    return [];
  }
};

const normalisePath = (path: string) => path.toLowerCase().replace(/\/+$/, "");

// Mirrors the backend conflict rules: case-insensitive, trailing slashes
// ignored, and a parent and child folder count as the same area. Comparison is
// on whole path segments so siblings like "Interviews" and "Interviews v2"
// don't clash.
export const pathsOverlap = (a: string, b: string): boolean => {
  const la = normalisePath(a);
  const lb = normalisePath(b);
  return la === lb || la.startsWith(`${lb}/`) || lb.startsWith(`${la}/`);
};

export const isPathWithin = (path: string, parent: string): boolean => {
  const lp = normalisePath(path);
  const lparent = normalisePath(parent);
  return lp === lparent || lp.startsWith(`${lparent}/`);
};

export const collectLockedPaths = (
  operations: ManageMaterialsOperation[],
): string[] =>
  operations.flatMap((operation) => [
    ...parsePaths(operation.sourcePaths),
    ...parsePaths(operation.destinationPaths),
  ]);

export const isPathLocked = (path: string, lockedPaths: string[]): boolean =>
  lockedPaths.some((lockedPath) => pathsOverlap(path, lockedPath));
