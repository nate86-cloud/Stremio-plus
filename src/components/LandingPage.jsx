import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Download, Shield, Zap, Cloud, Monitor, ExternalLink, ArrowRight, Sparkles, Code2 } from 'lucide-react'
import readmeRaw from '../../README.md?raw'

const GITHUB_URL = 'https://github.com/nate86-cloud/nate86-cloud'
const RELEASE_URL = `${GITHUB_URL}/releases/tag/v1.0.0`

export default function LandingPage({ onEnterApp }) {
  const [showReadme, setShowReadme] = useState(false)

  return (
    <div className="min-h-full pb-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[2.5rem] glass-panel p-8 sm:p-12 mb-8">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-accent/20 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-violet-500/15 rounded-full blur-[60px] pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-8">
          <div className="w-28 h-28 rounded-[1.8rem] overflow-hidden shadow-2xl shadow-black/30 shrink-0 border border-white/10">
            <img src="/icon.png" alt="Stremio + icon" className="w-full h-full object-cover" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs font-medium text-accent mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              v1.0.0 • Electron + Vite • All platforms
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-none">
              <span className="text-neutral-900 dark:text-white">Stremio</span>
              <span className="text-accent"> +</span>
            </h1>
            <p className="mt-3 text-[11px] tracking-[0.2em] font-semibold text-neutral-500 dark:text-white/40 uppercase">Stremio Plus</p>
            <p className="mt-4 text-base leading-relaxed text-neutral-600 dark:text-white/70 max-w-2xl">
              Custom desktop build of Stremio — bundles the local streaming server at <code className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-xs">127.0.0.1:11470</code>,
              Supabase cloud sync, Sentry, and auto-updates. Black glass, plus sign, no Electron default.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={onEnterApp}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-white text-sm font-semibold shadow-lg shadow-accent/25 hover:bg-accent/90 transition-colors"
              >
                Open App <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 text-sm font-medium hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
              >
                <Code2 className="w-4 h-4" /> GitHub
              </a>
              <a
                href={RELEASE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 text-sm font-medium hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
              >
                <Download className="w-4 h-4" /> Releases
              </a>
            </div>
          </div>

          <div className="hidden lg:flex flex-col gap-2 shrink-0">
            <div className="glass-clear rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><Monitor className="w-4 h-4" /></div>
              <div>
                <p className="text-xs font-medium">macOS • Windows • Linux</p>
                <p className="text-[11px] text-neutral-500 dark:text-white/50">dmg / AppImage / exe</p>
              </div>
            </div>
            <div className="glass-clear rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><Shield className="w-4 h-4" /></div>
              <div>
                <p className="text-xs font-medium">Gatekeeper bypass docs</p>
                <p className="text-[11px] text-neutral-500 dark:text-white/50">Included in README</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {[
          { icon: Zap, title: 'Bundled streaming server', desc: 'No separate install — 127.0.0.1:11470 auto-starts via launcher.cjs' },
          { icon: Cloud, title: 'Supabase cloud sync', desc: 'Profiles, watch progress & settings synced with RLS per user' },
          { icon: Shield, title: 'Hardened Electron', desc: 'contextIsolation, sandbox, CSP, no Node in renderer, safe IPC' },
          { icon: Monitor, title: '.asar + obfuscated', desc: 'Vite bundle obfuscated, sourcemaps off, asar unpack for server' },
          { icon: Download, title: 'Auto-updater', desc: 'electron-updater checks GitHub Releases every 6h' },
          { icon: Code2, title: 'Open source', desc: 'Build with electron-builder for dmg / AppImage / exe' },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="glass-panel rounded-2xl p-5">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center text-accent mb-3">
              <Icon className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs leading-relaxed text-neutral-500 dark:text-white/50 mt-1">{desc}</p>
          </div>
        ))}
      </div>

      {/* Downloads */}
      <div className="glass-panel rounded-[2rem] p-6 sm:p-8 mb-8">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Download className="w-4 h-4" /> Download v1.0.0</h2>
        <p className="text-xs text-neutral-500 dark:text-white/50 mt-1">All 3 OS installers carry the new Stremio + icon (no Electron default).</p>
        <div className="mt-5 grid sm:grid-cols-3 gap-3">
          <a href={`${RELEASE_URL}`} target="_blank" rel="noreferrer" className="group glass-clear rounded-2xl p-4 hover:bg-accent/10 transition-colors">
            <p className="text-xs font-semibold">macOS</p>
            <p className="text-[11px] text-neutral-500 dark:text-white/50">Stremio-Plus-1.0.0-x64.dmg (Intel) + arm64</p>
            <span className="inline-flex items-center gap-1 text-xs text-accent mt-2 group-hover:gap-1.5 transition-all">GitHub Releases <ExternalLink className="w-3 h-3" /></span>
          </a>
          <a href={`${RELEASE_URL}`} target="_blank" rel="noreferrer" className="group glass-clear rounded-2xl p-4 hover:bg-accent/10 transition-colors">
            <p className="text-xs font-semibold">Linux</p>
            <p className="text-[11px] text-neutral-500 dark:text-white/50">Stremio-Plus-1.0.0.AppImage</p>
            <span className="inline-flex items-center gap-1 text-xs text-accent mt-2 group-hover:gap-1.5 transition-all">GitHub Releases <ExternalLink className="w-3 h-3" /></span>
          </a>
          <a href={`${RELEASE_URL}`} target="_blank" rel="noreferrer" className="group glass-clear rounded-2xl p-4 hover:bg-accent/10 transition-colors">
            <p className="text-xs font-semibold">Windows</p>
            <p className="text-[11px] text-neutral-500 dark:text-white/50">Stremio-Plus-Setup-1.0.0.exe</p>
            <span className="inline-flex items-center gap-1 text-xs text-accent mt-2 group-hover:gap-1.5 transition-all">GitHub Releases <ExternalLink className="w-3 h-3" /></span>
          </a>
        </div>
      </div>

      {/* README toggle */}
      <div className="glass-panel rounded-[2rem] overflow-hidden">
        <button
          onClick={() => setShowReadme(v => !v)}
          className="w-full flex items-center justify-between px-6 sm:px-8 py-5 hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors"
        >
          <span className="text-sm font-semibold flex items-center gap-2"><Code2 className="w-4 h-4" /> Full README on GitHub</span>
          <span className="text-xs px-3 py-1 rounded-full bg-black/5 dark:bg-white/10">{showReadme ? 'Hide' : 'Show'}</span>
        </button>
        {showReadme && (
          <div className="px-6 sm:px-8 pb-8 pt-2 border-t border-black/5 dark:border-white/5">
            <article className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-black/5 dark:prose-pre:bg-white/5 prose-pre:border prose-pre:border-black/5 dark:prose-pre:border-white/5 prose-code:text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{readmeRaw}</ReactMarkdown>
            </article>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-neutral-400 dark:text-white/30 mt-6">
        Stremio + • <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline hover:text-accent">nate86-cloud/nate86-cloud</a> • v1.0.0
      </p>
    </div>
  )
}
