/** Which sides of a sideways-scrolling box have content out of sight. */
export interface ScrollEdges {
  left: boolean;
  right: boolean;
}

/**
 * Reads a scroll box's geometry into "is there more to the left / right".
 *
 * Browsers report fractional scroll positions on zoomed and high-density
 * screens, so a box scrolled fully to one end can sit a pixel short of it.
 * Anything within a pixel counts as the end, or the hint would never go away.
 */
export function scrollEdges(box: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}): ScrollEdges {
  const hidden = box.scrollWidth - box.clientWidth;
  if (hidden <= 1) return { left: false, right: false };
  return {
    left: box.scrollLeft > 1,
    right: box.scrollLeft < hidden - 1,
  };
}
