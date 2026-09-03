import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowUpRight,
  AudioLines,
  Blocks,
  Download,
  Globe,
  Mail,
  Radio,
  Sparkles,
  Users,
} from "lucide-react";
import { GlassLink, GlassPanel } from "@/components/glass";
import { CopyCommand } from "@/components/copy-command";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import iconUrl from "@/assets/stremio-icon.png";
import showcase from "@/assets/app-showcase.jpg";

const RELEASE = "https://github.com/nate86-cloud/Stremio-plus/releases/latest";
const SUPPORT_MAIL = "stremioplus.help@gmail.com";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stremio + 1.0.0 — OG Stremio with an updated UI" },
      {
        name: "description",
        content:
          "Stremio + 1.0.0: better live streaming support, updated UI, up to 4 user profiles with DiceBear avatars, audio normalisation and proxy configuration. macOS, Windows and Linux builds.",
      },
      { property: "og:title", content: "Stremio + — OG Stremio with an updated UI" },
      {
        property: "og:description",
        content:
          "Better live streaming, updated UI, up to 4 user profiles, audio normalisation and proxy configuration. Native .dmg, .exe and .AppImage builds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const platforms = [
  {
    id: "macos",
    label: "macOS",
    file: "Stremio-Plus-1.0.0-x64.dmg",
    note: "Apple silicon & Intel · 12.0+",
  },
  { id: "windows", label: "Windows", file: "Stremio-Plus-Setup-1.0.0.exe", note: "Installer & portable zip" },
  { id: "linux", label: "Linux", file: "Stremio-Plus-1.0.0.AppImage", note: "AppImage · glibc 2.31+" },
] as const;

type PlatformId = (typeof platforms)[number]["id"];

function Landing() {
  const [active, setActive] = useState<PlatformId>("macos");

  return (
    <div className="overscroll-none scrollbar-hide relative min-h-screen overflow-x-hidden">
      {/* subtle ambient light for refraction to bend */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 -left-24 size-[34rem] rounded-full bg-violet/10 blur-[150px]" />
        <div className="absolute top-1/2 -right-32 size-[28rem] rounded-full bg-teal/8 blur-[160px]" />
      </div>

      <header className="sticky top-0 z-40 px-5 pt-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <GlassPanel radius="md" className="flex items-center gap-2.5 py-2 pr-4 pl-3">
            <img src={iconUrl} alt="Stremio +" width={26} height={26} className="size-[26px] rounded-md" />
            <p className="text-[13px] leading-none font-medium tracking-[-0.01em]">Stremio +</p>
          </GlassPanel>
          <GlassPanel radius="md" className="flex items-center px-3 py-1.5">
            <p className="font-serif text-[13px] leading-none text-muted-foreground">v1.0.0</p>
          </GlassPanel>
          <div className="ml-auto flex items-center gap-2">
            <GlassLink href={RELEASE} size="sm" className="hidden sm:inline-flex">
              Releases
              <ArrowUpRight strokeWidth={1.5} className="size-3.5" />
            </GlassLink>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* Hero */}
        <section className="grid grid-cols-1 items-end gap-12 pt-24 pb-20 lg:grid-cols-12 lg:pt-32">
          <div className="lg:col-span-7">
            <p className="font-serif text-[15px] text-muted-foreground italic">
              Release 1.0.0 — the redesign
            </p>
            <h1 className="mt-4 text-[clamp(2.8rem,7vw,5rem)] leading-[0.95] font-light tracking-[-0.045em] text-balance-tight">
              The OG Stremio,<br />
              built like glass.
            </h1>
            <p className="mt-4 text-[clamp(1.1rem,2.4vw,1.5rem)] font-light tracking-[-0.02em] text-foreground/80">
              OG Stremio with an updated ui
            </p>
            <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
              A fully redesigned interface, enhanced instant live streaming playback, , user profiles integration, proxy configuration, and more...&nbsp;
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <GlassLink href={RELEASE} size="lg" tone="tinted" className="pl-6">
                <Download strokeWidth={1.5} className="size-[18px]" />
                Download for {platforms.find((p) => p.id === active)?.label}
              </GlassLink>
              <div className="flex gap-2">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActive(p.id)}
                    className={cn(
                      "glass glass-hover h-14 rounded-2xl border border-border/70 px-4 text-[13px] font-medium",
                      active === p.id ? "text-foreground" : "text-muted-foreground",
                    )}
                    aria-pressed={active === p.id}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="font-mono mt-4 text-xs text-muted-foreground">
              {platforms.find((p) => p.id === active)?.file} ·{" "}
              {platforms.find((p) => p.id === active)?.note}
            </p>
          </div>

          <GlassPanel radius="xl" className="p-6 lg:col-span-5 lg:mb-2">
            <img
              src={iconUrl}
              alt="Stremio Plus application icon"
              width={112}
              height={112}
              className="size-28 rounded-3xl"
            />
            <dl className="mt-8 space-y-4">
              {[
                ["Live streaming", "\u00a0Instant stream playback"],
                ["Profiles", "Per-user libraries"],
                ["Audio", "Normalised volume\u00a0"],
                ["Network", "Proxy configuration"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-3 last:border-0">
                  <dt className="text-[13px] text-muted-foreground">{k}</dt>
                  <dd className="font-serif truncate text-[15px]">{v}</dd>
                </div>
              ))}
            </dl>
          </GlassPanel>
        </section>

        {/* Showcase */}
        <section className="pb-24">
          <GlassPanel radius="2xl" className="overflow-hidden p-2 sm:p-3">
            <img
              src={showcase}
              alt="Stremio Plus interface showing the featured title hero, continue watching shelf and trending row"
              width={1600}
              height={1008}
              loading="lazy"
              className="w-full rounded-3xl"
            />
          </GlassPanel>
        </section>

        {/* What's new */}
        <section className="pb-24">
          <h2 className="text-3xl font-light tracking-[-0.035em]">What's new</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-6">
              <GlassPanel radius="xl" className="p-7 md:col-span-3">
              <Users strokeWidth={1.5} className="size-5 text-accent" />
              <h3 className="mt-5 text-2xl font-light tracking-[-0.03em]">Introducing profiles</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Share an account with up to 4 people. Separate libraries, playback history and personal achievements and watch stats tailored to your space
              </p>
            </GlassPanel>

            <GlassPanel radius="xl" className="p-7 md:col-span-3">
              <Radio strokeWidth={1.5} className="size-5 text-accent" />
              <h3 className="mt-5 text-2xl font-light tracking-[-0.03em]">Lives playback</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                We improved live content playback. Watch high quality live sports streams, tv and broadcast in real time.
              </p>
            </GlassPanel>

            <GlassPanel radius="xl" className="p-7 md:col-span-4">
              <AudioLines strokeWidth={1.5} className="size-5 text-accent" />
              <h3 className="mt-5 text-2xl font-light tracking-[-0.03em]">Audio normalisation</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Normalisation toggle — no more reaching for the volume key at every dialogue and loud explosion.
              </p>
              <ul className="mt-6 space-y-4">
                {[
                  ["Whisper-to-explosion", "Dialogue stays clear, explosions stay controlled without riding the volume keys."],
                  ["Zero-latency, on-device", "Processed locally in the audio pipeline. No round-trip, no extra buffering."],
                  ["Per-profile memory", "Toggle remembers your preference per profile. Turn it on once."],
                ].map(([k, v]) => (
                  <li key={k} className="border-b border-border/60 pb-3 last:border-0">
                    <p className="text-[14px] font-medium tracking-[-0.01em]">{k}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{v}</p>
                  </li>
                ))}
              </ul>
            </GlassPanel>

            <div className="grid grid-cols-1 gap-4 md:col-span-2">
              <GlassPanel radius="xl" className="p-7">
                <Globe strokeWidth={1.5} className="size-5 text-accent" />
                <h3 className="mt-5 text-xl font-light tracking-[-0.03em]">Proxy configuration</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Bypass network blocks and regional restrictions. 100% privacy and fluid connection.
                </p>
              </GlassPanel>
              <GlassPanel radius="xl" className="p-7">
                <Blocks strokeWidth={1.5} className="size-5 text-accent" />
                <h3 className="mt-5 text-xl font-light tracking-[-0.03em]">Add-on flexibility</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Full add-on catalogue support with per-profile install scopes and manual manifest
                  URLs.
                </p>
              </GlassPanel>
            </div>
          </div>
        </section>

        {/* Install & first launch */}
        <section className="pb-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl font-light tracking-[-0.035em]">First launch</h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                The app is unsigned, so every OS shows one warning on first open. Clear it once and
                later launches stay quiet.
              </p>
            </div>
            <div className="glass flex gap-1 rounded-2xl border border-border/60 p-1">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActive(p.id)}
                  aria-pressed={active === p.id}
                  className={cn(
                    "rounded-xl px-4 py-2 text-[13px] font-medium transition-transform duration-150",
                    active === p.id
                      ? "glass border border-border/70 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8">
            {active === "macos" && (
              <GlassPanel radius="xl" className="space-y-6 p-7">
                <Step n="01" title="Install">
                  Open <Mono>Stremio-Plus-1.0.0-x64.dmg</Mono> and drag <strong className="font-medium">Stremio Plus</strong> into{" "}
                  <Mono>/Applications</Mono>.
                </Step>
                <Step n="02" title="Open the first time">
                  Right-click (Control-click) the app in Finder → <strong className="font-medium">Open</strong> →{" "}
                  <strong className="font-medium">Open</strong> again. This whitelists it permanently.
                </Step>
                <Step n="03" title="If macOS says “damaged” or “cannot be checked”">
                  Clear the quarantine attribute, then right-click → Open again.
                </Step>
                <div className="space-y-3 pt-1">
                  <CopyCommand label="Clear attributes" command={`xattr -cr "/Applications/Stremio Plus.app"`} />
                  <CopyCommand
                    label="Stronger — remove quarantine"
                    command={`sudo xattr -rd com.apple.quarantine "/Applications/Stremio Plus.app"`}
                  />
                  <CopyCommand
                    label="Remove quarantine and launch"
                    command={`sudo xattr -rd com.apple.quarantine "/Applications/Stremio Plus.app" && open "/Applications/Stremio Plus.app"`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  macOS 13+ alternative: System Settings → Privacy &amp; Security → “Stremio Plus was
                  blocked” → Open Anyway. No <Mono>spctl --master-disable</Mono> needed.
                </p>
              </GlassPanel>
            )}

            {active === "windows" && (
              <GlassPanel radius="xl" className="space-y-6 p-7">
                <Step n="01" title="Run the installer">
                  Double-click <Mono>Stremio-Plus-Setup-1.0.0.exe</Mono>. SmartScreen reports “Windows
                  protected your PC / Unknown publisher”.
                </Step>
                <Step n="02" title="Allow it">
                  Click <strong className="font-medium">More info</strong> →{" "}
                  <strong className="font-medium">Run anyway</strong>.
                </Step>
                <Step n="03" title="Still blocked?">
                  Right-click the <Mono>.exe</Mono> → Properties → tick{" "}
                  <strong className="font-medium">Unblock</strong> → Apply, then run again.
                </Step>
                <Step n="04" title="Portable build">
                  Extract the <Mono>.zip</Mono> from <Mono>release/</Mono> anywhere and run{" "}
                  <Mono>Stremio Plus.exe</Mono> — same dialog applies once.
                </Step>
                <div className="space-y-3 pt-1">
                  <CopyCommand
                    label="PowerShell — unblock a downloaded file"
                    command={`Unblock-File -Path "$HOME\\Downloads\\Stremio-Plus-Setup-1.0.0.exe"`}
                  />
                  <CopyCommand
                    label="PowerShell — install silently"
                    command={`Start-Process "$HOME\\Downloads\\Stremio-Plus-Setup-1.0.0.exe" -ArgumentList "/S" -Wait`}
                  />
                </div>
              </GlassPanel>
            )}

            {active === "linux" && (
              <GlassPanel radius="xl" className="space-y-6 p-7">
                <Step n="01" title="Make it executable and run">
                  The AppImage runs in place — no install step, no root.
                </Step>
                <div className="space-y-3">
                  <CopyCommand label="Run" command={`chmod +x "Stremio-Plus-1.0.0.AppImage" && ./"Stremio-Plus-1.0.0.AppImage"`} />
                  <CopyCommand
                    label="Inspect / integrate into the app menu"
                    command={`./"Stremio-Plus-1.0.0.AppImage" --appimage-extract`}
                  />
                  <CopyCommand
                    label="Root or container environments"
                    command={`./"Stremio-Plus-1.0.0.AppImage" --no-sandbox`}
                  />
                  <CopyCommand label="Ubuntu 22.04+ mount failure" command="sudo apt install libfuse2" />
                </div>
              </GlassPanel>
            )}
          </div>
        </section>

        {/* Credits / third party */}
        <section className="pb-24">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <GlassPanel radius="xl" className="p-7">
              <Sparkles strokeWidth={1.5} className="size-5 text-accent" />
              <h2 className="mt-5 text-xl font-light tracking-[-0.03em]">Powered by DiceBear</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Profile avatars are generated with{" "}
                <a
                  href="https://www.dicebear.com"
                  className="text-foreground underline underline-offset-4 transition-opacity hover:opacity-70"
                >
                  DiceBear
                </a>
                , an open source avatar library. Thanks to its maintainers and artists.
              </p>
            </GlassPanel>
            <GlassPanel radius="xl" className="p-7">
              <Mail strokeWidth={1.5} className="size-5 text-accent" />
              <h2 className="mt-5 text-xl font-light tracking-[-0.03em]">Support</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Questions, bugs, errors:{" "}
                <a
                  href={`mailto:${SUPPORT_MAIL}`}
                  className="text-foreground underline underline-offset-4 transition-opacity hover:opacity-70"
                >
                  {SUPPORT_MAIL}
                </a>
              </p>
            </GlassPanel>
          </div>
        </section>

        <section className="pb-28">
          <GlassPanel
            radius="2xl"
            className="flex flex-wrap items-center justify-between gap-6 p-9"
          >
            <div>
              <h2 className="text-2xl font-light tracking-[-0.03em]">Get 1.0.0</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Incremental future updates will be rolling out soon
              </p>
            </div>
            <GlassLink href={RELEASE} size="lg" tone="tinted">
              <Download strokeWidth={1.5} className="size-[18px]" />
              All builds on GitHub
            </GlassLink>
          </GlassPanel>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        <div className="space-y-4 border-t border-border/60 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              © 2026 Stremio Plus · v1.0.0 · unsigned community build
            </p>
            <div className="flex flex-wrap items-center gap-5">
              <Link
                to="/terms"
                className="text-xs text-muted-foreground transition-opacity duration-150 hover:opacity-70"
              >
                Terms of Service
              </Link>
              <a
                href={`mailto:${SUPPORT_MAIL}`}
                className="text-xs text-muted-foreground transition-opacity duration-150 hover:opacity-70"
              >
                {SUPPORT_MAIL}
              </a>
              <a
                href={RELEASE}
                className="text-xs text-muted-foreground transition-opacity duration-150 hover:opacity-70"
              >
                github.com/nate86-cloud/Stremio-plus
              </a>
            </div>
          </div>
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Stremio + is an unofficial community build based on the open source Stremio project. All
            credit for the original application goes to Stremio and its creators; Stremio is a
            trademark of its respective owners and this project is not affiliated with or endorsed
            by them. Avatars provided by DiceBear.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <span className="font-serif w-8 shrink-0 text-[15px] text-muted-foreground tabular-nums">{n}</span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium tracking-[-0.01em]">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono rounded-md bg-secondary/70 px-1.5 py-0.5 text-[12px] text-foreground/90">
      {children}
    </code>
  );
}
