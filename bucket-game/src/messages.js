export const SCORE_LINES = ["The well accepts your offering.", "Well done. Literally.", "Bucket delivered.", "Another one for the collection.", "The well is pleased."];
export const SWISH_LINES = ["Nothing but water.", "Clean. The well didn't even feel it.", "Pure swish."];
export const MISS_LINES = {
  short: ["Short. The well remains bucketless.", "Didn't even reach. The well yawns.", "A bit more oomph."],
  long: ["Overthrown. The well sighs.", "Too far. That bucket has other plans.", "Easy, champion. Less power."],
  wide: ["Wide. The well pretends not to notice.", "The well is over there. Allegedly.", "Aim is a suggestion, apparently."],
  rim: ["Clonk! In and out.", "So close the well felt it.", "The rim said no."],
  roof: ["Off the roof. Architecture wins.", "The roof is not the well.", "Roof: 1, you: 0."],
  perched: ["Balanced on the edge. Art, but no points.", "Stuck up there. Impressive, honestly."],
};

export function finalLine(score) {
  if (score === 0) return "The well is still waiting.";
  if (score < 10) return "A modest donation to the well.";
  if (score < 30) return "The well will remember this.";
  return "The well is now mostly buckets.";
}

export function statsLine({ makes, throws, swishes, bestStreak }) {
  const parts = [`${makes} of ${throws} in`];
  if (swishes > 0) parts.push(`${swishes} ${swishes === 1 ? "swish" : "swishes"}`);
  if (bestStreak > 1) parts.push(`best streak ${bestStreak}`);
  return parts.join(" · ");
}
