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

// Case-insensitive, trailing slashes ignored, and compared on whole path
// segments so siblings like "Interviews" and "Interviews v2" don't match.
export const isPathWithin = (path: string, parent: string): boolean => {
  const lp = normalisePath(path);
  const lparent = normalisePath(parent);
  return lp === lparent || lp.startsWith(`${lparent}/`);
};
