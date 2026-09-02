import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Download, Shield, Zap, Cloud, Monitor, ExternalLink, ArrowRight, Code2,
  Play, Star, Users, HardDrive, Lock, Cpu, Film, Sparkle, ChevronDown, Check
} from 'lucide-react'
import readmeRaw from '../../README.md?raw'

const GITHUB_URL = 'https://github.com/nate86-cloud/nate86-cloud'
const RELEASE_URL = `${GITHUB_URL}/releases/tag/v1.0.0`

function usePlatform() {
  return useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : ''
    if (ua.includes('mac')) return 'mac'
    if (ua.includes('win')) return 'win'
    return 'linux'
  }, [])
}

export default function LandingPage({ onEnterApp }) {
  const [showReadme, setShowReadme] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)
  const platform = usePlatform()

  return (
    <div className="min-h-full pb-12 -m-1">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap');`}</style>

      {/* NAV */}
      <div className="sticky top-0 z-20 -mx-6 -mt-4 px-6 py-3 flex items-center justify-between backdrop-blur-2xl bg-[var(--bg-base)]/70 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-3">
          <img src="/icon.png" alt="" className="w-8 h-8 rounded-xl shadow-md" />
          <span className="text-sm font-bold tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Stremio <span className="text-accent">+</span></span>
          <span className="hidden sm:inline-flex ml-2 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-medium text-accent">v1.0.0</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-black/5 dark:bg-white/10 text-xs font-medium hover:bg-black/10 transition-colors">
            <Code2 className="w-3.5 h-3.5" /> GitHub
          </a>
          <button onClick={onEnterApp} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent text-white text-xs font-semibold shadow-md shadow-accent/20 hover:bg-accent/90 transition-colors">
            Launch App <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* HERO */}
      <div className="relative mt-6 rounded-[2.8rem] overflow-hidden glass-panel p-0">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full blur-[90px] opacity-30" style={{ background: 'radial-gradient(circle at 30% 30%, #8B5CF6, transparent 60%)' }} />
          <div className="absolute -bottom-40 -left-40 w-[560px] h-[560px] rounded-full blur-[100px] opacity-20" style={{ background: 'radial-gradient(circle at 70% 70%, #38BDF8, transparent 60%)' }} />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        </div>

        <div className="relative grid lg:grid-cols-[1.05fr_0.95fr] gap-0">
          <div className="p-8 sm:p-10 lg:p-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 dark:bg-white/10 border border-white/10 backdrop-blur text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium">All platforms • Auto-updates • Custom icon</span>
              <span className="hidden sm:inline-flex ml-1 px-1.5 py-0.5 rounded-full bg-accent text-white text-[10px] font-bold">NEW</span>
            </div>

            <h1 className="mt-5 text-[42px] sm:text-[56px] font-bold tracking-[-0.03em] leading-[0.9]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              <span className="text-neutral-900 dark:text-white">Stremio</span>
              <span className="text-accent"> +</span>
              <span className="block text-[18px] sm:text-[22px] font-medium tracking-normal text-neutral-500 dark:text-white/50 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                Black glass. Plus sign. No Electron default.
              </span>
            </h1>

            <p className="mt-5 text-[15px] leading-relaxed text-neutral-600 dark:text-white/65 max-w-[560px]" style={{ fontFamily: 'Inter, sans-serif' }}>
              The Stremio you love — now as a hardened desktop app. Bundled <span className="font-mono text-xs px-1.5 py-1 rounded bg-black/5 dark:bg-white/10">127.0.0.1:11470</span> server,
              Supabase sync, Sentry and <span className="font-medium text-neutral-900 dark:text-white">Stremio +</span> everywhere — Dock, Windows title bar, and installer.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={onEnterApp} className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-accent text-white text-sm font-semibold shadow-xl shadow-accent/25 hover:shadow-accent/30 hover:bg-accent/90 transition-all hover:-translate-y-[1px]">
                <Play className="w-4 h-4 fill-white" /> Open Stremio +
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <a href={RELEASE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white dark:bg-white text-neutral-900 text-sm font-semibold shadow-md hover:shadow-lg transition-all">
                <Download className="w-4 h-4" /> Download
              </a>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 backdrop-blur text-sm font-medium hover:bg-black/10 dark:hover:bg-white/15 transition-colors">
                View Source
              </a>
            </div>

            <div className="mt-7 flex items-center gap-6 text-xs">
              <span className="inline-flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> 1.0.0</span>
              <span className="inline-flex items-center gap-1.5 opacity-60"><Users className="w-3.5 h-3.5" /> Open source</span>
              <span className="inline-flex items-center gap-1.5 opacity-60"><Shield className="w-3.5 h-3.5" /> Gatekeeper docs</span>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/15">✓ Intel Mac</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/15">✓ Apple Silicon</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/15">✓ AppImage</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/15">✓ Windows exe</span>
            </div>
          </div>

          {/* Mock window */}
          <div className="relative p-6 sm:p-8 lg:p-10 flex items-center">
            <div className="relative w-full max-w-[520px] mx-auto rounded-[1.6rem] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.45),0_12px_24px_rgba(0,0,0,0.25)] border border-white/10 bg-[#0a0a0f]">
              <div className="h-9 flex items-center gap-1.5 px-4 bg-white/[0.04] border-b border-white/5">
                <span className="w-3 h-3 rounded-full bg-red-500/80" /><span className="w-3 h-3 rounded-full bg-yellow-500/80" /><span className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-3 text-[11px] font-medium tracking-wide opacity-60">Stremio +</span>
                <span className="ml-auto text-[10px] px-2 py-1 rounded-full bg-accent/15 text-accent border border-accent/20">v1.0.0</span>
              </div>
              <div className="p-4 grid grid-cols-3 gap-3">
                <div className="col-span-3 h-28 rounded-xl bg-gradient-to-br from-violet-600/30 to-blue-500/20 border border-white/5 flex items-end p-3">
                  <div>
                    <p className="text-xs font-semibold text-white">Continue Watching</p>
                    <p className="text-[11px] text-white/60">Bundled server • 127.0.0.1:11470</p>
                  </div>
                </div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-white/[0.06] border border-white/5 flex items-center justify-center">
                    <Film className="w-5 h-5 opacity-30" />
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4 flex gap-2">
                <span className="flex-1 h-8 rounded-full bg-white/5 border border-white/5 flex items-center px-3 text-[11px] opacity-50">Search…</span>
                <span className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white"><Play className="w-3.5 h-3.5 fill-white" /></span>
              </div>
              <div className="absolute -bottom-6 -right-6 w-28 h-28 rounded-[1.4rem] overflow-hidden shadow-xl border border-white/10 hidden sm:block">
                <img src="/icon.png" alt="" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BENTO FEATURES */}
      <div className="mt-6 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7 glass-panel rounded-[1.8rem] p-6 sm:p-7 flex flex-col">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-violet-400"><Zap className="w-5 h-5" /></div>
          <h3 className="mt-4 text-base font-semibold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Zero-config streaming</h3>
          <p className="text-sm text-neutral-500 dark:text-white/55 mt-1 leading-relaxed">Bundled <span className="font-mono text-xs">stremio-server/server.js</span> auto-starts. No separate download, no port juggling — just open and play. Falls back to external service if needed.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/10 text-xs flex items-center gap-1.5"><HardDrive className="w-3 h-3" /> 127.0.0.1:11470</span>
            <span className="px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/10 text-xs flex items-center gap-1.5"><Cpu className="w-3 h-3" /> launcher.cjs</span>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-5 glass-panel rounded-[1.8rem] p-6 sm:p-7">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-400"><Cloud className="w-5 h-5" /></div>
          <h3 className="mt-4 text-base font-semibold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Supabase sync</h3>
          <p className="text-sm text-neutral-500 dark:text-white/55 mt-1">Profiles, watch progress, and settings follow you — RLS per <span className="font-mono text-xs">auth.uid()</span>.</p>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-4 glass-panel rounded-[1.8rem] p-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400"><Lock className="w-5 h-5" /></div>
          <h3 className="mt-3 text-sm font-semibold">Hardened Electron</h3>
          <p className="text-xs text-neutral-500 dark:text-white/55 mt-1 leading-relaxed">contextIsolation • sandbox • CSP • safe IPC via contextBridge. No raw Node in renderer.</p>
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-4 glass-panel rounded-[1.8rem] p-6">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400"><Shield className="w-5 h-5" /></div>
          <h3 className="mt-3 text-sm font-semibold">Secure by default</h3>
          <p className="text-xs text-neutral-500 dark:text-white/55 mt-1">External nav blocked, <span className="font-mono text-xs">file://</span> allow-list, permission handler denies camera/mic.</p>
        </div>
        <div className="col-span-12 lg:col-span-4 glass-panel rounded-[1.8rem] p-6 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/20 flex items-center justify-center text-pink-400"><Sparkle className="w-5 h-5" /></div>
            <h3 className="mt-3 text-sm font-semibold">Polished</h3>
            <p className="text-xs text-neutral-500 dark:text-white/55 mt-1">Asar, obfuscated, no sourcemaps. Dock shows <b>Stremio +</b>, not Electron.</p>
          </div>
          <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-accent">Stremio + everywhere <ArrowRight className="w-3 h-3" /></div>
        </div>
      </div>

      {/* DOWNLOADS — OS aware highlight */}
      <div className="mt-6 glass-panel rounded-[1.8rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}><Download className="w-4 h-4" /> Download v1.0.0</h2>
            <p className="text-xs text-neutral-500 dark:text-white/50 mt-1">All 3 OS installers carry the new Stremio + icon. Auto-updates via GitHub Releases.</p>
          </div>
          <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-600 dark:text-emerald-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live on GitHub
          </span>
        </div>

        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          {[
            { os: 'mac', label: 'macOS', files: 'Stremio-Plus-1.0.0-x64.dmg (Intel) + arm64', icon: Monitor },
            { os: 'linux', label: 'Linux', files: 'Stremio-Plus-1.0.0.AppImage', icon: Monitor },
            { os: 'win', label: 'Windows', files: 'Stremio-Plus-Setup-1.0.0.exe', icon: Monitor },
          ].map(({ os, label, files, icon: Icon }) => {
            const active = platform === os
            return (
              <a key={os} href={RELEASE_URL} target="_blank" rel="noreferrer" className={`group relative overflow-hidden rounded-2xl p-5 border transition-all hover:-translate-y-0.5 ${active ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20' : 'glass-clear hover:bg-accent/5 hover:border-accent/15'}`}>
                {active && <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-full bg-white text-accent">Your OS</span>}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${active ? 'bg-white text-accent' : 'bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className={`mt-3 text-sm font-semibold ${active ? 'text-white' : ''}`}>{label}</p>
                <p className={`text-[11px] mt-1 ${active ? 'text-white/80' : 'text-neutral-500 dark:text-white/50'}`}>{files}</p>
                <span className={`inline-flex items-center gap-1 text-xs mt-3 font-medium ${active ? 'text-white' : 'text-accent'} group-hover:gap-1.5 transition-all`}>GitHub Releases <ExternalLink className="w-3 h-3" /></span>
              </a>
            )
          })}
        </div>
      </div>

      {/* GATEKEEPER FAQ */}
      <div className="mt-6 glass-panel rounded-[1.8rem] overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2"><Shield className="w-4 h-4" /> Bypass Gatekeeper (unsigned)</h3>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/15">First launch only</span>
        </div>
        {[
          { os: 'macOS', cmd: 'xattr -cr "/Applications/Stremio Plus.app"', desc: 'Right-click → Open → Open (whitelists). Or System Settings → Privacy & Security → Open Anyway.' },
          { os: 'Linux', cmd: 'chmod +x "Stremio-Plus-1.0.0.AppImage" && ./"Stremio-Plus-1.0.0.AppImage"', desc: 'Use --no-sandbox if root/container. Ubuntu 22.04: sudo apt install libfuse2.' },
          { os: 'Windows', cmd: 'Stremio-Plus-Setup-1.0.0.exe', desc: 'SmartScreen → More info → Run anyway. Portable zip: extract → Stremio Plus.exe.' },
        ].map(({ os, cmd, desc }) => {
          const isOpen = openFaq === os
          return (
            <div key={os} className="border-b last:border-0 border-black/5 dark:border-white/5">
              <button onClick={() => setOpenFaq(isOpen ? null : os)} className="w-full flex items-center justify-between px-6 sm:px-8 py-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors text-left">
                <span className="text-sm font-medium">{os}</span>
                <ChevronDown className={`w-4 h-4 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-6 sm:px-8 pb-5">
                  <pre className="px-4 py-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-xs overflow-auto"><code>{cmd}</code></pre>
                  <p className="text-xs text-neutral-500 dark:text-white/50 mt-2">{desc}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* README */}
      <div className="mt-6 glass-panel rounded-[1.8rem] overflow-hidden">
        <button onClick={() => setShowReadme(v => !v)} className="w-full flex items-center justify-between px-6 sm:px-8 py-5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors">
          <span className="text-sm font-semibold flex items-center gap-2"><Code2 className="w-4 h-4" /> Full README on GitHub</span>
          <span className="text-xs px-3 py-1 rounded-full bg-black/5 dark:bg-white/10 flex items-center gap-1">{showReadme ? 'Hide' : 'Show'} <ChevronDown className={`w-3 h-3 transition-transform ${showReadme ? 'rotate-180' : ''}`} /></span>
        </button>
        {showReadme && (
          <div className="px-6 sm:px-8 pb-8 pt-2 border-t border-black/5 dark:border-white/5">
            <article className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-black/5 dark:prose-pre:bg-white/5 prose-pre:border prose-pre:border-black/5 dark:prose-pre:border-white/5 prose-code:text-xs prose-a:text-accent">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{readmeRaw}</ReactMarkdown>
            </article>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-clear"><Check className="w-3 h-3 text-emerald-500" /> asar + obfuscated</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-clear"><Check className="w-3 h-3 text-emerald-500" /> Sentry + updater</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-clear"><Check className="w-3 h-3 text-emerald-500" /> Stremio + everywhere</span>
      </div>

      <p className="text-center text-[11px] text-neutral-400 dark:text-white/30 mt-6">
        Stremio + • <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline hover:text-accent">nate86-cloud/nate86-cloud</a> • v1.0.0 • In-app via Info → Landing
      </p>
    </div>
  )
}
