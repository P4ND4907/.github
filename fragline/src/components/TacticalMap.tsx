import { useEffect, useRef, type MouseEvent } from 'react'
import { getMap } from '../data/map'
import type { MatchPlayer } from '../types'
import './TacticalMap.css'

interface Props {
  players: MatchPlayer[]
  mapId?: string | null
  live?: boolean
  selectedUnitId?: string | null
  orderMarker?: { x: number; y: number } | null
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
  interactive,
  onSelectUnit,
  onCommandMove,
}: Props) {
  const map = getMap(mapId)
  const svgRef = useRef<SVGSVGElement>(null)
  const renderRef = useRef<PosMap>({})
  const targetRef = useRef<PosMap>({})
  const pawnsLayerRef = useRef<SVGGElement>(null)
  const sites = map.zones.filter((z) => z.site)

  // Keep latest sim positions as lerp targets
  useEffect(() => {
    const next: PosMap = {}
    for (const p of players) {
      next[p.id] = { x: p.x, y: p.y }
      if (!renderRef.current[p.id]) {
        renderRef.current[p.id] = { x: p.x, y: p.y }
      }
    }
    targetRef.current = next
    // Drop stale ids
    for (const id of Object.keys(renderRef.current)) {
      if (!next[id]) delete renderRef.current[id]
    }
  }, [players])

  // Smooth visual interpolation every frame
  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      // Higher = snappier follow; ~12–16 feels smooth without lag
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
    let best = 5.5
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

  return (
    <div
      className={`tactical-map ${live ? 'is-live' : ''} ${interactive ? 'is-interactive' : ''}`}
      style={{ ['--map-accent' as string]: map.accent }}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className="map-svg"
        role="img"
        aria-label={`${map.name} tactical map`}
        onClick={handleClick}
      >
        <defs>
          <pattern id={`grid-${map.id}`} width="6" height="6" patternUnits="userSpaceOnUse">
            <path
              d="M 6 0 L 0 0 0 6"
              fill="none"
              stroke="rgba(255,255,255,0.045)"
              strokeWidth="0.35"
            />
          </pattern>
          <radialGradient id={`floor-${map.id}`} cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#243041" />
            <stop offset="100%" stopColor="#141a22" />
          </radialGradient>
        </defs>

        <rect x="0" y="0" width="100" height="100" fill={`url(#floor-${map.id})`} />
        <rect x="0" y="0" width="100" height="100" fill={`url(#grid-${map.id})`} />

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
            rx="1.2"
            className="map-block"
          />
        ))}

        {sites.map((z) => (
          <g key={z.id} className="site-marker">
            <circle cx={z.x} cy={z.y} r="5.5" className="site-ring" />
            <text x={z.x} y={z.y + 1.6} textAnchor="middle" className="site-label">
              {z.site}
            </text>
          </g>
        ))}

        {orderMarker && (
          <g className="order-marker">
            <circle cx={orderMarker.x} cy={orderMarker.y} r="3.5" />
            <circle cx={orderMarker.x} cy={orderMarker.y} r="1.2" className="order-core" />
          </g>
        )}

        <g ref={pawnsLayerRef}>
          {players.map((p) => {
            const pos = renderRef.current[p.id] ?? p
            return (
              <g
                key={p.id}
                data-pid={p.id}
                className={`pawn ${p.team} ${p.alive ? '' : 'down'} ${
                  p.id === selectedUnitId ? 'selected' : ''
                } ${p.orderedTime > 0 ? 'ordered' : ''}`}
                transform={`translate(${pos.x} ${pos.y})`}
              >
                <circle r="3.1" className="pawn-body" />
                <circle r="3.8" className="pawn-ring" />
                {p.alive && (
                  <rect
                    x="-4"
                    y="4.2"
                    width="8"
                    height="1.6"
                    rx="0.5"
                    className="hp-bg"
                  />
                )}
                {p.alive && (
                  <rect
                    x="-4"
                    y="4.2"
                    width={8 * Math.max(0, p.hp / p.maxHp)}
                    height="1.6"
                    rx="0.5"
                    className={`hp-fill ${p.team}`}
                  />
                )}
                <text y="-4.8" textAnchor="middle" className="pawn-name">
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
