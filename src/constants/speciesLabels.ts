/**
 * Scientific names for the fixed set of PAM quick-label species codes.
 * Single source of truth so the onboarding copy and the quick-label
 * button tooltips can't drift out of sync.
 */

export const SPECIES_LABELS: Record<string, string> = {
  RHIICT: "Rhinella icterica",
  DENMIN: "Dendropsophus minutus",
  DENNAH: "Dendropsophus nahdereri",
  SCIALT: "Scinax alter",
  LEPFUS: "Leptodactylus fuscus",
  AMEPIC: "Ameerega picta",
  BOAFAB: "Boana faber",
};

export function getSpeciesScientificName(code: string): string | undefined {
  return SPECIES_LABELS[code.toUpperCase()];
}
