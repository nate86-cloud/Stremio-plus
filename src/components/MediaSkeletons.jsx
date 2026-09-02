function SkeletonBlock({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-2xl bg-neutral-200/70 dark:bg-white/10 ${className}`} />
}

export function HeroBannerSkeleton() {
  return (
    <SkeletonBlock className="w-full h-[420px] rounded-3xl mb-10 shrink-0" />
  )
}

export function MovieCardSkeleton() {
  return <SkeletonBlock className="w-full aspect-[2/3] rounded-2xl" />
}

export function MovieGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5" aria-label="Loading media">
      {Array.from({ length: count }, (_, index) => (
        <MovieCardSkeleton key={index} />
      ))}
    </div>
  )
}

export function MovieRowSkeleton({ count = 6 }) {
  return (
    <div className="flex gap-5 overflow-hidden pb-2" aria-label="Loading media">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="shrink-0 w-40 sm:w-44 md:w-48">
          <MovieCardSkeleton />
        </div>
      ))}
    </div>
  )
}
