import { FloatingPathsBackground } from "@/components/ui/floating-paths";
import { cn } from "@/lib/utils";

// The Peerly mark's three nodes (mirrors BrandMark), in the order the tick
// draws through them, each with the delay at which the line reaches it.
const NODES = [
  { cx: 4, cy: 12.5, delay: 100 },
  { cx: 9.75, cy: 18.25, delay: 400 },
  { cx: 20, cy: 6.5, delay: 820 },
];

/**
 * Full-screen plum preloader. The Peerly tick draws itself, its three nodes pop
 * in as the line reaches them, then the wordmark and label rise in. A slow halo
 * and a sliding bar keep it alive if loading runs long.
 *
 * Presentational only - PageTransitionProvider decides when it shows. All
 * motion is CSS (`.preloader*` in styles.css) and stops under
 * prefers-reduced-motion.
 */
export function Preloader({
  label,
  leaving = false,
  boot = false,
}: {
  label: string;
  /** Fading out. */
  leaving?: boolean;
  /** The first-paint overlay from the server render. */
  boot?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "preloader auth-theme fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-auth-panel text-auth-panel-heading",
        boot && "preloader-boot",
        leaving && "preloader-leaving",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 text-auth-panel-heading/40 [contain:strict]"
        aria-hidden="true"
      >
        <FloatingPathsBackground position={1} className="absolute inset-0" />
        <FloatingPathsBackground position={-1} className="absolute inset-0" />
      </div>

      <div className="relative flex flex-col items-center px-6 text-center">
        <span className="preloader-halo relative flex size-24 items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="relative size-14">
            <path
              className="preloader-tick"
              d="M4 12.5l5.75 5.75L20 6.5"
              pathLength={1}
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {NODES.map((node) => (
              <circle
                key={node.delay}
                className="preloader-node"
                cx={node.cx}
                cy={node.cy}
                r="3.25"
                fill="currentColor"
                style={{ animationDelay: `${node.delay}ms` }}
              />
            ))}
          </svg>
        </span>

        <p className="preloader-word mt-3 text-3xl font-semibold tracking-tight">Peerly</p>

        <div
          className="preloader-bar mt-6 h-1 w-44 overflow-hidden rounded-full bg-auth-panel-heading/15"
          aria-hidden="true"
        >
          <span />
        </div>

        <p className="preloader-label mt-4 text-sm text-auth-panel-foreground">{label}…</p>
      </div>
    </div>
  );
}
