import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, GraduationCap, ShieldCheck, Users, type LucideIcon } from "lucide-react";

import { BrandMark } from "@/components/layout/BrandMark";
import { FloatingPathsBackground } from "@/components/ui/floating-paths";
import { usePageTransition } from "@/hooks/use-page-transition";
import { titleHead } from "@/lib/page-title";

/**
 * The first screen of Peerly: pick how you're signing in. It always shows,
 * even with a session still in the browser - the portals are one sign-in away,
 * and a page that silently jumps into someone's dashboard reads as broken.
 */
export const Route = createFileRoute("/")({
  head: () => titleHead("Welcome"),
  component: WelcomePage,
});

/**
 * Background photo for the welcome page (source: Content/roleseelctionimage1.jpg).
 * Set to null to fall back to the plum ground with the animated line field.
 */
const WELCOME_BACKGROUND: string | null = "/students-on-campus.jpg";

const choices: Array<{
  as: "student" | "lecturer";
  icon: LucideIcon;
  title: string;
  hint: string;
}> = [
  {
    as: "student",
    icon: GraduationCap,
    title: "I'm a student",
    hint: "Rate your group members and follow your assessments.",
  },
  {
    as: "lecturer",
    icon: Users,
    title: "I'm a lecturer",
    hint: "Manage your classes, groups and peer assessments.",
  },
];

/**
 * The choice only decides which sign-in form comes next - the portal you land
 * in is always decided by the account's own role.
 */
function WelcomePage() {
  const { transitionOnClick } = usePageTransition();

  return (
    <div className="auth-theme relative isolate flex min-h-dvh flex-col overflow-hidden bg-auth-panel text-auth-panel-foreground">
      {WELCOME_BACKGROUND ? (
        <>
          {/* Shown sharp - the source is high resolution. Anchored right of
              centre so the two students stay in frame when a narrow screen
              crops the wide photo. */}
          <img
            src={WELCOME_BACKGROUND}
            alt=""
            className="absolute inset-0 -z-10 size-full object-cover object-[65%_50%]"
          />
          {/* Plum scrim: keeps the white copy readable whatever the photo is. */}
          <div className="absolute inset-0 -z-10 bg-auth-panel/75" />
        </>
      ) : (
        <div className="pointer-events-none absolute inset-0 -z-10 text-auth-panel-heading/60 [contain:strict]">
          <FloatingPathsBackground position={1} className="absolute inset-0" />
          <FloatingPathsBackground position={-1} className="absolute inset-0" />
        </div>
      )}

      <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-10 sm:py-8">
        <span className="flex items-center gap-2.5">
          <BrandMark className="size-8 text-auth-panel-heading" />
          <span className="text-xl font-semibold tracking-tight text-auth-panel-heading">
            Peerly
          </span>
        </span>
        <img
          src="/nwu-logo-white.png"
          alt="North-West University"
          width={290}
          height={100}
          className="h-10 w-auto sm:h-12"
        />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-6">
        <div className="w-full max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-balance text-auth-panel-heading sm:text-5xl">
            Welcome to Peerly
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-balance">
            Fair, transparent peer assessment for NWU group projects. How are you signing in?
          </p>

          <div className="mt-10 grid gap-4 text-left sm:grid-cols-2">
            {choices.map((choice) => (
              <Link
                key={choice.as}
                to="/login"
                search={{ as: choice.as }}
                onClick={transitionOnClick(
                  choice.as === "student" ? "Opening student sign in" : "Opening lecturer sign in",
                )}
                className="group flex flex-col rounded-2xl bg-card p-6 shadow-raised transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-auth-panel-heading"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <choice.icon className="size-6" aria-hidden="true" />
                </span>
                <span className="mt-5 text-lg font-semibold text-foreground">{choice.title}</span>
                <span className="mt-1 flex-1 text-sm text-muted-foreground">{choice.hint}</span>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Continue
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            ))}
          </div>

          {/*
            Administrators get a block of their own, but a slimmer, quieter one
            than the two above: there are only ever a few of them, and a third
            full card would weigh the choice down for every student. Like the
            cards, it only picks the form's wording - the portal comes from the
            account's role.
          */}
          <Link
            to="/login"
            search={{ as: "admin" }}
            onClick={transitionOnClick("Opening administrator sign in")}
            className="group mt-4 flex items-center gap-4 rounded-2xl border border-auth-panel-heading/25 bg-auth-panel-heading/10 px-6 py-4 text-left backdrop-blur-sm transition hover:border-auth-panel-heading/50 hover:bg-auth-panel-heading/15 focus-visible:outline-auth-panel-heading"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-auth-panel-heading/15 text-auth-panel-heading">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-auth-panel-heading">
                I'm an administrator
              </span>
              <span className="block text-sm">Manage lecturer and administrator accounts.</span>
            </span>
            {/* The word goes on a phone, where it pushed the title onto three lines. */}
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-auth-panel-heading">
              <span className="hidden sm:inline">Continue</span>
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
        </div>
      </main>

      <footer className="px-5 pb-6 text-center text-xs sm:px-10">
        © {new Date().getFullYear()} North-West University · Peerly
      </footer>
    </div>
  );
}
