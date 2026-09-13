import { memo, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const VIEW_W = 600;
const VIEW_H = 1000;
const COUNT = 36;

/**
 * One field of curves fanned across a portrait 600×1000 frame: each line is a
 * gentle S from beyond the left edge to beyond the right, offset vertically so
 * the field covers the whole height. `mirror` flips it horizontally, so two
 * fields cross into a weave and flow in opposite directions.
 *
 * Everything that varies per line (opacity, width, speed, phase) is derived
 * from its index, so the server render and hydration always match.
 */
function buildPaths(mirror: boolean) {
  const x = (value: number) => (mirror ? VIEW_W - value : value);
  return Array.from({ length: COUNT }, (_, i) => {
    const dy = Math.round((i / (COUNT - 1) - 0.5) * 1100);
    const bend = i * 6;
    return {
      id: i,
      d: `M${x(-120)} ${80 + dy}C${x(140)} ${-40 + dy + bend} ${x(320)} ${720 + dy - bend} ${x(720)} ${560 + dy}`,
      opacity: 0.12 + (((i * 37) % 11) / 11) * 0.45,
      width: 0.6 + ((i * 13) % 7) * 0.12,
      duration: 18 + ((i * 7) % 12),
      // Negative delays start every line mid-flow, so nothing moves in lockstep.
      delay: -((i * 11) % 30),
    };
  });
}

const fields = { forward: buildPaths(false), mirrored: buildPaths(true) };

/**
 * A slow, endlessly looping field of flowing lines, drawn behind whatever it
 * wraps. Strokes use `currentColor`: set the colour and its strength with a
 * `text-*` class. `position` picks the direction - negative mirrors the field.
 *
 * Animated with CSS (`.floating-path` in styles.css), not a JS animation
 * library, for three reasons:
 * - Seamless: each line's dash travels exactly one full period per cycle, so
 *   the last frame is the first. No snap back at the loop boundary.
 * - Immune to the page: parent re-renders (typing, clicking) cannot restart it,
 *   and `memo` skips re-rendering the 72 paths altogether.
 * - Cheap: no per-frame JavaScript competing with input handling.
 *
 * With prefers-reduced-motion the lines are drawn still.
 */
export const FloatingPathsBackground = memo(function FloatingPathsBackground({
  position,
  children,
  className,
}: {
  position: number;
  className?: string;
  children?: ReactNode;
}) {
  const paths = position < 0 ? fields.mirrored : fields.forward;

  return (
    <div className={cn("relative w-full", className)}>
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <svg
          className="h-full w-full"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          {paths.map((path) => (
            <path
              key={path.id}
              className="floating-path"
              d={path.d}
              pathLength={1}
              stroke="currentColor"
              strokeWidth={path.width}
              strokeOpacity={path.opacity}
              style={{
                animationDuration: `${path.duration}s`,
                animationDelay: `${path.delay}s`,
              }}
            />
          ))}
        </svg>
      </div>
      {children}
    </div>
  );
});
