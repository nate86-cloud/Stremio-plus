import { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'

function BackToTop({ scrollContainerRef }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    function handleScroll() {
      setVisible(container.scrollTop > 300)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [scrollContainerRef])

  function scrollToTop() {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!visible) return null

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-8 right-8 w-12 h-12 rounded-full bg-white/60 dark:bg-white/10 backdrop-blur-xl border border-black/5 dark:border-white/10 shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform duration-200"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  )
}

export default BackToTop