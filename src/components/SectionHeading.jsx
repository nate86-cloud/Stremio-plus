import { ChevronRight } from 'lucide-react'

function SectionHeading({ children, onSeeAll }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-5 rounded-full bg-accent shadow-[0_0_12px] shadow-accent/60" />
        <h2 className="text-xl font-semibold tracking-tight">{children}</h2>
      </div>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="group flex items-center gap-1 text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:text-accent dark:hover:text-accent transition-colors duration-200 shrink-0"
          aria-label={`See all ${children}`}
        >
          <span className="hidden sm:inline">See all</span>
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-black/5 dark:bg-white/10 group-hover:bg-accent/15 transition-colors duration-200">
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
          </span>
        </button>
      )}
    </div>
  )
}

export default SectionHeading
