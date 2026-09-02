import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { login } from '../services/stremioApi'

function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  if (!isOpen) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const result = await login(email, password)
      setIsLoading(false)
      setEmail('')
      setPassword('')
      onLoginSuccess(result)
    } catch (err) {
      setIsLoading(false)
      setError(err.message || 'Login failed. Please check your credentials.')
    }
  }

  function handleClose() {
    setError(null)
    setEmail('')
    setPassword('')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel relative w-full max-w-sm rounded-3xl overflow-hidden p-8"
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 flex items-center justify-center transition-colors duration-200"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-2xl font-semibold mb-1">Sign In</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
          Sign in with your Stremio account to sync your library and add-ons.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 outline-none focus:ring-2 focus:ring-accent transition-all duration-200"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 outline-none focus:ring-2 focus:ring-accent transition-all duration-200"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="glass-capsule w-full flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium bg-accent! text-white hover:bg-accent/90! transition-colors duration-200 disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginModal
