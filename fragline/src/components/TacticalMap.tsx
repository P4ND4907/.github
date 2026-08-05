import { useEffect, useRef, type MouseEvent } from 'react'
import { CELL, getMap } from '../data/map'
import type { CombatFx, Gadget, MatchPlayer } from '../types'
import './TacticalMap.css'

interface Props {
  players: MatchPlayer[]
  mapId?: string | null
  live?: boolean
  selectedUnitId?: string | null
  orderMarker?: { x: number; y: number } | null
  fx?: CombatFx[]
  gadgets?: Gadget[]
  interactive?: boolean
  onSelectUnit?: (id: string) => void
  onCommandMove?: (x: number, y: number) => void
}

type PosMap = Record<string, { x: number; y: number }>

export function TacticalMap({
  players,
  mapId,
  live,
  selectedUnitId,
  orderMarker,
  fx = [],
  gadgets = [],
  interactive,
  onSelectUnit,
  onCommandMove,
}: Props) {
  const map = getMap(mapId)
  const size = map.size
  const svgRef = useRef<SVGSVGElement>(null)
  const renderRef = useRef<PosMap>({})
  const targetRef = useRef<PosMap>({})
  const pawnsLayerRef = useRef<SVGGElement>(null)
  const sites = map.zones.filter((z) => z.site)

  useEffect(() => {
    const next: PosMap = {}
    for (const p of players) {
      next[p.id] = { x: p.x, y: p.y }
      if (!renderRef.current[p.id]) {
        renderRef.current[p.id] = { x: p.x, y: p.y }
      }
    }
    targetRef.current = next
    for (const id of Object.keys(renderRef.current)) {
      if (!next[id]) delete renderRef.current[id]
    }
  }, [players])

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const follow = 1 - Math.exp(-14 * dt)

      const targets = targetRef.current
      const rendered = renderRef.current
      for (const id of Object.keys(targets)) {
        const t = targets[id]
        const r = rendered[id] ?? t
        rendered[id] = {
          x: r.x + (t.x - r.x) * follow,
          y: r.y + (t.y - r.y) * follow,
        }
      }

      const layer = pawnsLayerRef.current
      if (layer) {
        for (const node of layer.children) {
          const el = node as SVGGElement
          const id = el.dataset.pid
          if (!id || !rendered[id]) continue
          const { x, y } = rendered[id]
          el.setAttribute('transform', `translate(${x} ${y})`)
        }
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [mapId])

  const corridors = map.edges
    .map(([a, b]) => {
      const za = map.zones.find((z) => z.id === a)
      const zb = map.zones.find((z) => z.id === b)
      if (!za || !zb) return null
      return { x1: za.x, y1: za.y, x2: zb.x, y2: zb.y, key: `${a}-${b}` }
    })
    .filter(Boolean) as { x1: number; y1: number; x2: number; y2: number; key: string }[]

  function toWorld(e: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = pt.matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
  }

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    if (!interactive || !live) return
    const world = toWorld(e)
    if (!world) return

    let nearest: MatchPlayer | null = null
    let best = 7
    const rendered = renderRef.current
    for (const p of players) {
      if (p.team !== 'ally' || !p.alive) continue
      const pos = rendered[p.id] ?? p
      const d = Math.hypot(pos.x - world.x, pos.y - world.y)
      if (d < best) {
        best = d
        nearest = p
      }
    }
    if (nearest) {
      onSelectUnit?.(nearest.id)
      return
    }
    onCommandMove?.(world.x, world.y)
  }

  const visibleGadgets = gadgets.filter((g) => {
    if (g.kind === 'frag') return true
    if (g.team === 'ally') return true
    return g.spotted
  })

  return (
    <div
      className={`tactical-map ${live ? 'is-live' : ''} ${interactive ? 'is-interactive' : ''}`}
      style={{ ['--map-accent' as string]: map.accent }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        className="map-svg"
        role="img"
        aria-label={`${map.name} tactical map`}
        onClick={handleClick}
      >
        <defs>
          <pattern
            id={`grid-${map.id}`}
            width={CELL}
            height={CELL}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.35"
            />
          </pattern>
          <pattern
            id={`hatch-${map.id}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="rgba(255,255,255,0.035)"
              strokeWidth="1.2"
            />
          </pattern>
          <radialGradient id={`floor-${map.id}`} cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor="#2a3648" />
            <stop offset="55%" stopColor="#1a222e" />
            <stop offset="100%" stopColor="#10151c" />
          </radialGradient>
          <linearGradient id="tracer-ally" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(58,160,255,0)" />
            <stop offset="40%" stopColor="rgba(150,210,255,0.95)" />
            <stop offset="100%" stopColor="#fff" />
          </linearGradient>
          <linearGradient id="tracer-enemy" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,122,47,0)" />
            <stop offset="40%" stopColor="rgba(255,180,100,0.95)" />
            <stop offset="100%" stopColor="#fff" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={size} height={size} fill={`url(#floor-${map.id})`} />
        <rect x="0" y="0" width={size} height={size} fill={`url(#grid-${map.id})`} />
        <rect x="0" y="0" width={size} height={size} fill={`url(#hatch-${map.id})`} />

        {corridors.map((c) => (
          <line
            key={c.key}
            x1={c.x1}
            y1={c.y1}
            x2={c.x2}
            y2={c.y2}
            className="map-corridor"
          />
        ))}

        {map.blocks.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={Math.min(1.4, Math.min(b.w, b.h) * 0.15)}
            className="map-block"
          />
        ))}

        {/* Callout labels for named rooms / lanes */}
        {map.zones
          .filter((z) => !z.site)
          .map((z) => (
            <text
              key={`lbl-${z.id}`}
              x={z.x}
              y={z.y + 0.6}
              textAnchor="middle"
              className="zone-label"
            >
              {z.label}
            </text>
          ))}

        {sites.map((z) => (
          <g key={z.id} className="site-marker">
            <circle cx={z.x} cy={z.y} r="7.2" className="site-ring" />
            <circle cx={z.x} cy={z.y} r="3.2" className="site-core" />
            <text x={z.x} y={z.y + 2.2} textAnchor="middle" className="site-label">
              {z.site}
            </text>
          </g>
        ))}

        {/* Gadgets — enemy claymores only if spotted by Intelligence */}
        <g className="gadget-layer">
          {visibleGadgets.map((g) => {
            if (g.kind === 'claymore') {
              const arm = ((g.facing * 180) / Math.PI)
              const pulsing = g.fuse <= 0
              return (
                <g
                  key={g.id}
                  className={`gadget-claymore ${g.team} ${g.spotted || g.team === 'ally' ? 'known' : ''} ${pulsing ? 'armed' : ''}`}
                  transform={`translate(${g.x} ${g.y}) rotate(${arm})`}
                >
                  <polygon points="0,-2.2 4.5,3.2 -4.5,3.2" className="clay-body" />
                  <line x1="0" y1="0" x2="9" y2="0" className="clay-cone" />
                  <title>
                    {g.team === 'ally' ? 'Ally claymore' : 'Enemy claymore (spotted)'}
                  </title>
                </g>
              )
            }
            if (g.kind === 'frag') {
              const t = Math.max(0, g.fuse)
              return (
                <g
                  key={g.id}
                  className={`gadget-frag ${g.team}`}
                  transform={`translate(${g.x} ${g.y})`}
                >
                  <circle r={2.4 + (1 - Math.min(1, t)) * 1.2} className="frag-body" />
                  <circle r="1.1" className="frag-pin" />
                  <title>Frag · {t.toFixed(1)}s</title>
                </g>
              )
            }
            return null
          })}
        </g>

        {orderMarker && (
          <g className="order-marker">
            <circle cx={orderMarker.x} cy={orderMarker.y} r="4.2" />
            <circle cx={orderMarker.x} cy={orderMarker.y} r="1.4" className="order-core" />
          </g>
        )}

        <g className="fx-layer">
          {fx.map((f) => {
            const t = f.life / f.maxLife
            if (f.kind === 'shot') {
              const dx = f.toX - f.fromX
              const dy = f.toY - f.fromY
              const progress = 1 - t
              const cx = f.fromX + dx * progress
              const cy = f.fromY + dy * progress
              const tx = f.fromX + dx * Math.max(0, progress - 0.22)
              const ty = f.fromY + dy * Math.max(0, progress - 0.22)
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI
              return (
                <g key={f.id} className={`fx-shot ${f.team}`} opacity={0.4 + t * 0.6}>
                  <line
                    x1={f.fromX}
                    y1={f.fromY}
                    x2={f.toX}
                    y2={f.toY}
                    className="fx-beam"
                  />
                  <line
                    x1={tx}
                    y1={ty}
                    x2={cx}
                    y2={cy}
                    className="fx-tracer"
                    stroke={f.team === 'ally' ? 'url(#tracer-ally)' : 'url(#tracer-enemy)'}
                  />
                  <circle
                    cx={f.fromX}
                    cy={f.fromY}
                    r={1.4 + (1 - t) * 1.6}
                    className="fx-muzzle"
                  />
                  <g transform={`translate(${f.fromX} ${f.fromY}) rotate(${angle})`}>
                    <polygon
                      points="0,0 3.2,-1.3 3.2,1.3"
                      className="fx-muzzle-flare"
                      opacity={t}
                    />
                  </g>
                </g>
              )
            }

            if (f.kind === 'nade') {
              const scale = 0.7 + (1 - t) * 2.8
              return (
                <g
                  key={f.id}
                  className={`fx-nade ${f.team}`}
                  transform={`translate(${f.toX} ${f.toY})`}
                  opacity={Math.min(1, t * 1.5)}
                >
                  <circle r={5 * scale} className="fx-nade-ring" />
                  <circle r={2.2 * scale} className="fx-nade-core" />
                </g>
              )
            }

            if (f.kind === 'claymore') {
              const scale = 0.8 + (1 - t) * 2
              return (
                <g
                  key={f.id}
                  className={`fx-claymore ${f.team}`}
                  transform={`translate(${f.fromX} ${f.fromY})`}
                  opacity={t}
                >
                  <circle r={4 * scale} className="fx-clay-blast" />
                  <line
                    x1={0}
                    y1={0}
                    x2={f.toX - f.fromX}
                    y2={f.toY - f.fromY}
                    className="fx-clay-beam"
                  />
                </g>
              )
            }

            if (f.kind === 'hit') {
              const scale = 0.6 + (1 - t) * 1.4
              return (
                <g
                  key={f.id}
                  className={`fx-hit ${f.team}`}
                  transform={`translate(${f.toX} ${f.toY})`}
                  opacity={t}
                >
                  <circle r={2.4 * scale} className="fx-hit-ring" />
                  <circle r={1 * scale} className="fx-hit-core" />
                  {[0, 60, 120, 180, 240, 300].map((deg) => {
                    const rad = (deg * Math.PI) / 180
                    const reach = 3 * scale
                    return (
                      <line
                        key={deg}
                        x1={Math.cos(rad) * 0.6}
                        y1={Math.sin(rad) * 0.6}
                        x2={Math.cos(rad) * reach}
                        y2={Math.sin(rad) * reach}
                        className="fx-spark"
                      />
                    )
                  })}
                </g>
              )
            }

            const scale = 0.8 + (1 - t) * 2.2
            return (
              <g
                key={f.id}
                className={`fx-kill ${f.team}`}
                transform={`translate(${f.toX} ${f.toY})`}
                opacity={Math.min(1, t * 1.4)}
              >
                <circle r={3.8 * scale} className="fx-kill-blast" />
                <circle r={1.8 * scale} className="fx-kill-core" />
                <path
                  d={`M0 ${-3.4 * scale} L${1.5 * scale} ${1.9 * scale} L${-1.5 * scale} ${1.9 * scale} Z`}
                  className="fx-kill-flame"
                />
              </g>
            )
          })}
        </g>

        <g ref={pawnsLayerRef}>
          {players.map((p) => {
            const pos = renderRef.current[p.id] ?? p
            return (
              <g
                key={p.id}
                data-pid={p.id}
                className={`pawn ${p.team} ${p.alive ? '' : 'down'} ${
                  p.id === selectedUnitId ? 'selected' : ''
                } ${p.orderedTime > 0 ? 'ordered' : ''} ${
                  p.firingTime > 0 ? 'firing' : ''
                }`}
                transform={`translate(${pos.x} ${pos.y})`}
              >
                <circle r="3.4" className="pawn-body" />
                <circle r="4.2" className="pawn-ring" />
                {p.firingTime > 0 && <circle r="5.6" className="pawn-fire-ring" />}
                {p.alive && (
                  <rect
                    x="-4.5"
                    y="4.6"
                    width="9"
                    height="1.7"
                    rx="0.5"
                    className="hp-bg"
                  />
                )}
                {p.alive && (
                  <rect
                    x="-4.5"
                    y="4.6"
                    width={9 * Math.max(0, p.hp / p.maxHp)}
                    height="1.7"
                    rx="0.5"
                    className={`hp-fill ${p.team}`}
                  />
                )}
                <text y="-5.2" textAnchor="middle" className="pawn-name">
                  {p.name}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
