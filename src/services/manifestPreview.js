import { useState, useEffect } from 'react'
import { addonFetch } from '../utils/addonFetch'


export function useManifestPreview(manifestUrl) {
  const [status, setStatus] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)


  useEffect(() => {
    if (!manifestUrl) {
      setStatus('idle')
      setPreview(null)
      setError(null)
      return
    }


    let isMounted = true
    async function fetchManifest() {
      setStatus('loading')
      setError(null)


      try {
        const response = await addonFetch(manifestUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch manifest: ${response.status}`)
        }


        let manifest = null
        try {
          manifest = await response.json()
        } catch {}
        // Fallback for text/plain JSON (e.g. raw.githubusercontent.com) — wrapper now handles this, but keep as safety net
        if (!manifest || typeof manifest !== 'object') {
          try {
            const text = await response.text()
            manifest = JSON.parse(text)
          } catch {}
        }
        
        // Validate manifest structure to prevent crashes
        if (!manifest || typeof manifest !== 'object') {
          throw new Error('Invalid manifest format')
        }
        
        if (!manifest.name) {
          throw new Error('Manifest missing required field: name')
        }
        
        if (isMounted) {
          setPreview({
            transportUrl: manifestUrl,
            manifest,
          })
          setStatus('ready')
        }
      } catch (err) {
        if (isMounted) {
          console.error('Manifest fetch error:', err)
          setError(err.message || 'Failed to load manifest')
          setStatus('error')
        }
      }
    }


    const debounceTimer = setTimeout(fetchManifest, 500)


    return () => {
      isMounted = false
      clearTimeout(debounceTimer)
    }
  }, [manifestUrl])


  return { status, preview, error }
}
