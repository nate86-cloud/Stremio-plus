function GlassToggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`glass-interactive relative w-12 h-7 rounded-full transition-colors duration-300 ${
        checked ? 'bg-accent' : 'bg-black/10 dark:bg-white/15'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export default GlassToggle
