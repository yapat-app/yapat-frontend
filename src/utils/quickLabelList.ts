import type { LabelSpaceItem } from "../types";

/** Merge PAM + taxonomy label names; PAM order first, case-insensitive dedupe. */
export function mergeQuickLabelNames(
  pam: string[],
  taxonomy: string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...pam, ...taxonomy]) {
    const name = raw?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function labelNamesFromTaxonomyNodes(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  const names: string[] = [];
  for (const node of nodes) {
    const n = node as Record<string, unknown>;
    const name =
      (typeof n.name === "string" && n.name) ||
      (typeof n.scientific_name === "string" && n.scientific_name) ||
      (typeof n.canonical_name === "string" && n.canonical_name) ||
      "";
    if (name.trim()) names.push(name.trim());
  }
  return names;
}

export function labelNamesFromLabelSpace(items: LabelSpaceItem[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    const name = item.name?.trim() || item.scientific_name?.trim() || "";
    if (name) names.push(name);
  }
  return names;
}
