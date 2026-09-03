import { useState, useMemo } from 'react'
import {
  Download, Shield, Monitor, ExternalLink, ArrowRight, Code2,
  Play, Film, ChevronDown, Check, Sun, Moon
} from 'lucide-react'

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
  const [theme, setTheme] = useState(() => {
    if (typeof document !== 'undefined') return document.documentElement.getAttribute('data-theme') || 'auto'
    return 'auto'
  })
  const platform = usePlatform()

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark'
    setTheme(next)
    if (next === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('stremio-theme', next) } catch {}
  }

  const copy = async (id, e) => {
    const btn = e?.currentTarget
    const el = document.getElementById(id)
    if (!el) return
    await navigator.clipboard.writeText(el.innerText)
    if (btn) {
      const old = btn.innerHTML
      btn.innerHTML = 'Copied!'
      setTimeout(() => (btn.innerHTML = old), 1200)
    }
  }

  return (
    <div className="min-h-full pb-12 -m-1" style={{ overflowX: 'hidden' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap'); html,body{max-width:100%;overflow-x:hidden}`}</style>

      {/* NAV — two pills */}
      <div className="sticky top-0 z-20 flex gap-3 items-center justify-between max-w-[1120px] mx-auto px-0 py-3" style={{ backdropFilter: 'blur(0px)' }}>
        <div className="flex items-center gap-3 px-3 py-2 rounded-full"
          style={{
            background: 'var(--glass, rgba(255,255,255,0.62))',
            backdropFilter: 'blur(18px) saturate(160%) brightness(1.04)',
            WebkitBackdropFilter: 'blur(18px) saturate(160%) brightness(1.04)',
            border: '1px solid var(--border, rgba(0,0,0,0.07))',
            boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
            position: 'relative', overflow: 'hidden'
          }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.72), transparent 58%)', opacity: 0.45, pointerEvents: 'none', borderRadius: 999 }} />
          <img src="/icon.png" alt="" className="w-7 h-7 rounded-lg relative" />
          <span className="text-sm font-bold relative" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>Stremio <span className="text-accent">+</span></span>
          <span className="hidden sm:inline-flex ml-1 px-2 py-1 rounded-full text-[11px] font-medium border relative" style={{ background: 'rgba(109,77,246,0.10)', borderColor: 'rgba(109,77,246,0.14)', color: '#6D4DF6' }}>v1.0.0</span>
          <nav className="hidden md:flex gap-1 ml-2 relative">
            <a href="#features" className="px-3 py-1.5 rounded-full text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10" style={{ color: 'var(--muted, #6E6E73)' }}>Features</a>
            <a href="#download" className="px-3 py-1.5 rounded-full text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10" style={{ color: 'var(--muted, #6E6E73)' }}>Download</a>
            <a href="#gatekeeper" className="px-3 py-1.5 rounded-full text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10" style={{ color: 'var(--muted, #6E6E73)' }}>Gatekeeper</a>
            <button onClick={() => setShowReadme(true)} className="px-3 py-1.5 rounded-full text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10" style={{ color: 'var(--muted, #6E6E73)', background: 'transparent', border: 'none', cursor: 'pointer' }}>About</button>
          </nav>
        </div>

        <div className="flex items-center gap-2 px-2 py-1.5 rounded-full"
          style={{
            background: 'var(--glass, rgba(255,255,255,0.62))',
            backdropFilter: 'blur(18px) saturate(160%) brightness(1.04)',
            WebkitBackdropFilter: 'blur(18px) saturate(160%) brightness(1.04)',
            border: '1px solid var(--border, rgba(0,0,0,0.07))',
            boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
            position: 'relative', overflow: 'hidden'
          }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.72), transparent 58%)', opacity: 0.45, pointerEvents: 'none', borderRadius: 999 }} />
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10 relative" style={{ color: 'var(--muted, #6E6E73)' }}>
            <Code2 className="w-3.5 h-3.5" /> GitHub
          </a>
          <a href={RELEASE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-white relative" style={{ background: 'var(--text, #1D1D1F)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
            Download
          </a>
          <button onClick={toggleTheme} className="w-8 h-8 rounded-full grid place-items-center border relative" style={{ background: 'var(--glass)', borderColor: 'var(--border)' }} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <span className="text-xs">◐</span>}
          </button>
        </div>
      </div>

      {/* HERO — bigger type, reduced gradients, minimal */}
      <div className="relative mt-4 rounded-[2.8rem] overflow-hidden p-0" style={{ background: 'var(--glass)', backdropFilter: 'blur(22px) saturate(165%) brightness(1.02)', WebkitBackdropFilter: 'blur(22px) saturate(165%) brightness(1.02)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.08)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(600px 400px at 14% 8%, rgba(109,77,246,0.06), transparent 60%)', opacity: 0.6 }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.45), transparent 38%)', opacity: 0.18 }} />
        <div className="relative grid lg:grid-cols-[1.08fr_0.92fr] gap-0">
          <div className="p-8 sm:p-10 lg:p-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs" style={{ background: 'var(--bg-soft, #fff)', border: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Now available for macOS, Windows, Linux
            </div>
            <h1 className="mt-5 text-[46px] sm:text-[58px] font-bold tracking-[-0.04em] leading-[0.9]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              stremio +
            </h1>
            <p className="mt-4 text-[18px] leading-relaxed max-w-[560px]" style={{ color: 'var(--muted, #6E6E73)' }}>
              A native desktop experience for movies, series and live TV — built for focus, speed and shared watching.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={onEnterApp} className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-white text-sm font-semibold shadow-xl hover:shadow-2xl transition-all hover:-translate-y-[1px]" style={{ background: 'var(--text, #1D1D1F)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                <Play className="w-4 h-4 fill-white" /> Open Stremio + <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <a href={RELEASE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-semibold" style={{ background: 'var(--glass)', border: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
                <Download className="w-4 h-4" /> Download
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.14)', color: '#0d7a5f' }}>✓ Intel Mac</span>
              <span className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.14)', color: '#0d7a5f' }}>✓ Apple Silicon</span>
              <span className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.14)', color: '#0d7a5f' }}>✓ AppImage</span>
              <span className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.14)', color: '#0d7a5f' }}>✓ Windows exe</span>
            </div>
          </div>

          <div className="relative p-6 sm:p-8 lg:p-10 flex items-center" style={{ background: 'rgba(0,0,0,0.015)' }}>
            <div className="relative w-full max-w-[520px] mx-auto rounded-[1.6rem] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.12)] border" style={{ background: '#0A0A0F', borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="h-9 flex items-center gap-1.5 px-4" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} /><span className="w-3 h-3 rounded-full" style={{ background: '#ffbd2e' }} /><span className="w-3 h-3 rounded-full" style={{ background: '#28c940' }} />
                <span className="ml-3 text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Stremio +</span>
                <span className="ml-auto text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(109,77,246,0.12)', border: '1px solid rgba(109,77,246,0.18)', color: '#a78bfa' }}>v1.0.0</span>
              </div>
              <div className="p-4 grid grid-cols-3 gap-3">
                <div className="col-span-3 h-24 rounded-xl border flex items-end p-3" style={{ background: 'linear-gradient(135deg, rgba(109,77,246,0.14), rgba(56,189,248,0.08))', borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div><p className="text-xs font-semibold text-white">Continue Watching</p><p className="text-[11px] text-white/50">Your progress, everywhere</p></div>
                </div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl border flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <Film className="w-5 h-5" style={{ opacity: 0.3, color: '#fff' }} />
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4 flex gap-2">
                <span className="flex-1 h-8 rounded-full border flex items-center px-3 text-[11px]" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>Search movies, series…</span>
                <span className="w-8 h-8 rounded-full grid place-items-center text-white" style={{ background: 'var(--accent, #6D4DF6)' }}><Play className="w-3.5 h-3.5 fill-white" /></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BENTO — new UI improvements, minimal, Apple-like */}
      <h2 id="features" className="mt-10 mb-4 text-[22px] font-bold tracking-[-0.02em]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>What’s new in Stremio +</h2>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7 rounded-[22px] p-6 sm:p-7" style={{ background: 'var(--bg-soft, #fff)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
          <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'rgba(109,77,246,0.08)', border: '1px solid rgba(109,77,246,0.12)', color: '#6D4DF6' }}>✨</div>
          <h3 className="mt-4 text-[16px] font-semibold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>A new interface, rebuilt</h3>
          <p className="text-[14px] leading-relaxed mt-1" style={{ color: 'var(--muted)' }}>Liquid glass with high refraction and barely-there frost. Bigger type, clearer hierarchy, and motion that feels at home on macOS and Windows.</p>
        </div>
        <div className="col-span-12 lg:col-span-5 rounded-[22px] p-6 sm:p-7" style={{ background: 'var(--bg-soft, #fff)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
          <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.12)' }}>👥</div>
          <h3 className="mt-4 text-[16px] font-semibold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Profiles for everyone</h3>
          <p className="text-[14px] leading-relaxed mt-1" style={{ color: 'var(--muted)' }}>Up to 4 profiles per device. Each with their own watchlist, progress and recommendations.</p>
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-6 rounded-[22px] p-6" style={{ background: 'var(--bg-soft, #fff)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
          <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.12)' }}>📺</div>
          <h3 className="mt-3 text-sm font-semibold">Live, finally done right</h3>
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--muted)' }}>Smoother live streaming with lower latency, better buffering and instant channel switching.</p>
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-6 rounded-[22px] p-6" style={{ background: 'var(--bg-soft, #fff)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
          <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.12)' }}>🌗</div>
          <h3 className="mt-3 text-sm font-semibold">Light mode, crafted</h3>
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--muted)' }}>Not just inverted colors. Every surface and shadow was tuned for light — bright, calm, still Stremio.</p>
        </div>
        <div className="col-span-12 sm:col-span-6 rounded-[22px] p-6" style={{ background: 'var(--bg-soft, #fff)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
          <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.12)' }}>🏆</div>
          <h3 className="mt-3 text-sm font-semibold">Achievements that matter</h3>
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--muted)' }}>Watch, collect and unlock — streaks, marathons and badges that celebrate how you watch.</p>
        </div>
        <div className="col-span-12 sm:col-span-6 rounded-[22px] p-6" style={{ background: 'var(--bg-soft, #fff)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
          <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'rgba(109,77,246,0.08)', border: '1px solid rgba(109,77,246,0.12)' }}>⭕</div>
          <h3 className="mt-3 text-sm font-semibold">Profile rings, unlocked</h3>
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--muted)' }}>Your ring evolves with you. Bronze to Diamond — level up and show it off.</p>
        </div>
      </div>



      {/* DOWNLOADS — two pills per row, copy outside at opposite side */}
      <div id="download" className="mt-6 rounded-[28px] p-6 sm:p-8" style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-bold flex items-center gap-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}><Download className="w-4 h-4" /> Download v1.0.0</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Choose your system. Copy, paste, run.</p>
          </div>
          <span className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.14)', color: '#0d7a5f' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live on GitHub
          </span>
        </div>

        <div className="mt-6 grid sm:grid-cols-1 gap-4">
          {[
            { os: 'mac', label: 'macOS', sub: 'Stremio-Plus-1.0.0-x64.dmg (Intel) + arm64', id: 'cmd-mac', cmd: 'curl -L -o Stremio-Plus-1.0.0-x64.dmg https://github.com/nate86-cloud/nate86-cloud/releases/download/v1.0.0/Stremio-Plus-1.0.0-x64.dmg' },
            { os: 'linux', label: 'Linux', sub: 'Stremio-Plus-1.0.0.AppImage', id: 'cmd-linux', cmd: 'curl -L -o Stremio-Plus-1.0.0.AppImage https://github.com/nate86-cloud/nate86-cloud/releases/download/v1.0.0/Stremio-Plus-1.0.0.AppImage && chmod +x Stremio-Plus-1.0.0.AppImage' },
            { os: 'win', label: 'Windows', sub: 'Stremio-Plus-Setup-1.0.0.exe', id: 'cmd-win', cmd: 'Invoke-WebRequest -Uri https://github.com/nate86-cloud/nate86-cloud/releases/download/v1.0.0/Stremio-Plus-Setup-1.0.0.exe -OutFile Stremio-Plus-Setup-1.0.0.exe' },
          ].map(({ label, sub, id, cmd, os }) => {
            const active = platform === os
            return (
              <div key={label} className="rounded-[18px] p-5" style={{ background: active ? 'var(--accent)' : 'var(--bg-soft)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, color: active ? '#fff' : 'var(--text)', boxShadow: active ? '0 8px 24px rgba(109,77,246,0.18)' : 'none' }}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: active ? '#fff' : 'var(--glass)', border: `1px solid ${active ? '#fff' : 'var(--border)'}`, color: active ? 'var(--accent)' : 'var(--text)' }}>
                      <Monitor className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: active ? '#fff' : 'var(--text)' }}>{label}</p>
                      <p className="text-[11px]" style={{ color: active ? 'rgba(255,255,255,0.8)' : 'var(--muted)' }}>{sub}</p>
                    </div>
                  </div>
                  <a href={RELEASE_URL} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1 text-xs font-medium shrink-0" style={{ color: active ? '#fff' : 'var(--accent)' }}>
                    Releases <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <code id={id} className="flex-1 min-w-0 block px-4 py-3 rounded-full text-[11px] leading-relaxed truncate" style={{ background: active ? 'rgba(255,255,255,0.14)' : 'var(--glass)', border: `1px solid ${active ? 'rgba(255,255,255,0.18)' : 'var(--border)'}`, backdropFilter: 'blur(12px)', color: active ? '#fff' : 'var(--text)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    {cmd}
                  </code>
                  <button onClick={(e) => copy(id, e)} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-3 rounded-full text-xs font-semibold" style={{ background: active ? '#fff' : 'var(--text)', color: active ? 'var(--accent)' : 'var(--bg-soft)', border: `1px solid ${active ? '#fff' : 'var(--text)'}` }}>
                    <span>⎘</span> Copy
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* GATEKEEPER */}
      <div id="gatekeeper" className="mt-6 rounded-[22px] overflow-hidden" style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
        <div className="px-6 sm:px-8 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}><Shield className="w-4 h-4" /> Gatekeeper — first launch only</h3>
          <span className="text-[11px] px-2.5 py-1 rounded-full hidden sm:inline-flex" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.12)', color: '#b45309' }}>Unsigned</span>
        </div>
        {[
          { os: 'macOS', cmd: 'xattr -cr "/Applications/Stremio Plus.app" && open "/Applications/Stremio Plus.app"', desc: 'Or right-click → Open → Open, or System Settings → Privacy & Security → Open Anyway.' },
          { os: 'Linux', cmd: 'chmod +x "Stremio-Plus-1.0.0.AppImage" && ./"Stremio-Plus-1.0.0.AppImage"', desc: null },
          { os: 'Windows', cmd: '.\\Stremio-Plus-Setup-1.0.0.exe', desc: 'SmartScreen → More info → Run anyway.' },
        ].map(({ os, cmd, desc }) => {
          const id = `gate-${os}`
          return (
            <div key={os} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setOpenFaq(openFaq === os ? null : os)} className="w-full flex items-center justify-between px-6 sm:px-8 py-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors text-left">
                <span className="text-sm font-medium">{os}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${openFaq === os ? 'rotate-180' : ''}`} style={{ opacity: 0.5 }} />
              </button>
              {openFaq === os && (
                <div className="px-6 sm:px-8 pb-5">
                  <div className="flex items-center gap-3">
                    <code id={id} className="flex-1 min-w-0 block px-4 py-3 rounded-full text-[11px] truncate" style={{ background: 'var(--glass)', border: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace' }}>{cmd}</code>
                    <button onClick={(e) => copy(id, e)} className="shrink-0 px-4 py-3 rounded-full text-xs font-semibold" style={{ background: 'var(--text)', color: 'var(--bg-soft)' }}>Copy</button>
                  </div>
                  {desc && <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>{desc}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)' }}><Check className="w-3 h-3" style={{ color: '#10B981' }} /> asar + obfuscated</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)' }}><Check className="w-3 h-3" style={{ color: '#10B981' }} /> Stremio + everywhere</span>
      </div>

      <footer className="text-center text-[11px] mt-6" style={{ color: 'var(--muted-2)' }}>
        <div>Need help? <a href="mailto:stremioplus.help@gmail.com" style={{ color: 'var(--muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>stremioplus.help@gmail.com</a> • <button onClick={() => setShowReadme(true)} style={{ background: 'none', border: 'none', color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer', fontSize: '11px' }}>About</button></div>
        <div style={{ marginTop: 6, opacity: 0.6 }}>© 2026 Stremio +</div>
      </footer>

      {showReadme && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }} onClick={() => setShowReadme(false)}>
          <div className="max-w-[640px] w-full rounded-[24px] p-7" style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', margin: 0 }}>About this update</h3>
              <button onClick={() => setShowReadme(false)} style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--glass)', border: '1px solid var(--border)', cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, marginTop: 14 }}>
              Stremio + 1.0.0 is a full redesign — liquid glass, higher refraction and less frost so content stays crisp.
              Profiles make sharing effortless, live is faster and more stable, light mode is now first-class, and achievements turn watching into a gentle game — complete with profile rings that unlock as you level up.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
