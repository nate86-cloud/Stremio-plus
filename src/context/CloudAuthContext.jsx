import { createContext, useContext, useEffect, useState } from 'react'
import { getCloudUser, onCloudAuthStateChange } from '../services/cloudAuth'
import { isCloudConfigured } from '../services/supabaseClient'

const CloudAuthContext = createContext({
  user: null,
  isLoading: true,
  isCloudConfigured,
})

export function CloudAuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(isCloudConfigured)

  useEffect(() => {
    if (!isCloudConfigured) {
      setIsLoading(false)
      return
    }

    let cancelled = false
    getCloudUser().then((nextUser) => {
      if (!cancelled) {
        setUser(nextUser)
        setIsLoading(false)
      }
    })

    const unsubscribe = onCloudAuthStateChange((nextUser) => {
      if (!cancelled) setUser(nextUser)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return (
    <CloudAuthContext.Provider value={{ user, isLoading, isCloudConfigured }}>
      {children}
    </CloudAuthContext.Provider>
  )
}

export function useCloudAuth() {
  return useContext(CloudAuthContext)
}
