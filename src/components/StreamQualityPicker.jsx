import { useState, useEffect, useMemo } from 'react'
import { Loader2, Download, Server, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { groupStreamsByAddon, evaluateStreamHealth } from '../utils/streamAddons'
import TiltButton from './TiltButton'


const ROW_HEIGHT = 84 // approximate height of one stream row


function AddonCategoryButton({ group, isSelected, onSelect, disableHover }) {
  const baseClass = `w-full flex items-center justify-between gap-3 px-4 py-3 text-left rounded-xl border transition-colors duration-200 ${
    isSelected ? 'bg-accent/15 ring-1 ring-accent/40 border-accent/30' : 'bg-white/[0.04] border-white/10'
  }`
  const content = (
    <>
      <div className="flex items-center gap-2.5 min-w-0">
        <Server className={`w-4 h-4 shrink-0 ${isSelected ? 'text-accent' : 'text-neutral-400'}`} />
        <span className={`text-sm font-medium truncate ${isSelected ? 'text-accent' : 'text-neutral-900 dark:text-white'}`}>
          {group.label}
        </span>
      </div>
      <span className="text-xs px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 text-neutral-500 dark:text-neutral-400 font-medium shrink-0">
        {group.streams.length}
      </span>
    </>
  )
  if (disableHover) {
    return (
      <button onClick={onSelect} className={baseClass}>
        {content}
      </button>
    )
  }
  return (
    <TiltButton
      maxTilt={3}
      scale={1.01}
      onClick={onSelect}
      className={`glass-interactive ${baseClass}`}
    >
      {content}
    </TiltButton>
  )
}

function StreamRow({ stream, onSelectStream, resolvingStreamId, disableHover }) {
  const health = evaluateStreamHealth(stream)
  const isBlocked = health.status === 'dead'
  const baseClass = `w-full flex items-start justify-between gap-3 px-3.5 py-3 rounded-xl text-left border disabled:opacity-50 transition-colors duration-200 ${isBlocked ? 'opacity-60 ring-1 ring-amber-500/20 border-amber-500/20' : 'border-white/10 bg-white/[0.02]'}`
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug break-words line-clamp-1 text-neutral-900 dark:text-white mb-1.5">
          {stream.filename}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {stream.quality && stream.quality !== 'Unknown' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent">{stream.quality}</span>
          )}
          {stream.hdr && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">{stream.hdr}</span>}
          {stream.bitDepth && <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-neutral-500 dark:text-neutral-400">{stream.bitDepth}</span>}
          {stream.size && <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">{stream.size}</span>}
          {stream.seeders !== null && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${health.status === 'dead' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : health.status === 'weak' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : health.status === 'healthy' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-black/5 dark:bg-white/10 text-neutral-600 dark:text-neutral-300'}`}>
              👤 {stream.seeders} {health.status === 'dead' ? '• dead' : health.status === 'weak' ? '• weak' : health.status === 'healthy' ? '• healthy' : ''}
            </span>
          )}
          {health.status === 'dead' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Dead</span>}
          {health.status === 'weak' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">Weak</span>}
          {health.status === 'healthy' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Healthy</span>}
          {health.status === 'unknown' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-neutral-500">Unknown</span>}
          {stream.source && <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">{stream.source}</span>}
        </div>
        {health.reason && <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5 line-clamp-1">{health.reason}</p>}
      </div>
      {resolvingStreamId === stream.id ? (
        <Loader2 className="w-4 h-4 text-accent shrink-0 mt-1 animate-spin" />
      ) : isBlocked ? (
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-1" />
      ) : (
        <Download className="w-4 h-4 text-neutral-400 shrink-0 mt-1" />
      )}
    </>
  )
  if (disableHover) {
    return (
      <button
        onClick={() => onSelectStream(stream)}
        disabled={resolvingStreamId !== null}
        className={baseClass}
        style={{ height: ROW_HEIGHT }}
      >
        {inner}
      </button>
    )
  }
  return (
    <TiltButton
      maxTilt={4}
      scale={1.012}
      onClick={() => onSelectStream(stream)}
      disabled={resolvingStreamId !== null}
      className={baseClass}
      style={{ height: ROW_HEIGHT }}
    >
      {inner}
    </TiltButton>
  )
}


// Isolated scrolling list — only items inside window scroll, outer section stays fixed.
function StreamList({ streams, onSelectStream, resolvingStreamId, disableHover }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 flex flex-col gap-2 scroll-smooth" style={{ isolation: 'isolate', WebkitOverflowScrolling: 'touch' }}>
      {streams.map((stream) => (
        <StreamRow
          key={stream.id}
          stream={stream}
          onSelectStream={onSelectStream}
          resolvingStreamId={resolvingStreamId}
          disableHover={disableHover}
        />
      ))}
    </div>
  )
}


// streams: full flat list from searchStreams, as before — grouping now
// happens internally by addon rather than being pre-grouped by the caller.
function StreamQualityPicker({ streams, onSelectStream, resolvingStreamId, disableHover = false }) {
  const groups = useMemo(() => groupStreamsByAddon(streams), [streams])
  const [selectedGroupId, setSelectedGroupId] = useState(null)


  // Auto-select the first (largest) addon group whenever a new search
  // result set arrives, so the right pane is populated immediately
  // rather than starting empty.
  useEffect(() => {
    setSelectedGroupId(groups[0]?.id ?? null)
  }, [groups])


  if (groups.length === 0) return null


  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || groups[0]


  return (
    <div
      className="rounded-2xl border border-white/15 grid grid-cols-1 sm:grid-cols-[minmax(0,38%)_1fr] gap-0 overflow-hidden flex-1 min-h-0"
      style={{
        isolation: 'isolate',
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        contain: 'layout paint',
        transform: 'translateZ(0)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Left column: sources — isolated scroll with clear boundary */}
      <div
        className="overflow-y-auto overscroll-contain p-2 flex flex-col gap-1.5 border-b sm:border-b-0 sm:border-r border-white/15 min-h-0"
        style={{ isolation: 'isolate' }}
      >
        {groups.map((group) => (
          <AddonCategoryButton
            key={group.id}
            group={group}
            isSelected={selectedGroup?.id === group.id}
            onSelect={() => setSelectedGroupId(group.id)}
            disableHover={disableHover}
          />
        ))}
      </div>


      {/* Right column: resolution picker — isolated scroll window */}
      <div className="p-2 min-h-0 flex-1 overflow-hidden flex flex-col" style={{ isolation: 'isolate' }}>
        {selectedGroup && (
          <StreamList
            key={selectedGroup.id}
            streams={selectedGroup.streams}
            onSelectStream={onSelectStream}
            resolvingStreamId={resolvingStreamId}
            disableHover={disableHover}
          />
        )}
      </div>
    </div>
  )
}


export default StreamQualityPicker