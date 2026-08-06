import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
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

  const floorPads = useMemo(() => {
    const pads: { x: number; y: number; key: string }[] = []
    for (let r = 0; r < map.grid.length; r++) {
      for (let c = 0; c < map.grid[r].length; c++) {
        if (map.grid[r][c]) continue
        pads.push({
          x: c * CELL + 0.8,
          y: r * CELL + 0.8,
          key: `${c}-${r}`,
        })
      }
    }
    return pads
  }, [map])

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
      const follow = 1 - Math.exp(-8 * dt)

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

  const aimBeams = players
    .filter((p) => p.alive && p.aimTargetId && (p.aimTime ?? 0) > 0.05)
    .map((p) => {
      const target = players.find((t) => t.id === p.aimTargetId && t.alive)
      if (!target) return null
      const from = renderRef.current[p.id] ?? p
      const to = renderRef.current[target.id] ?? target
      return {
        id: `aim-${p.id}`,
        team: p.team,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        strength: Math.min(1, (p.aimTime ?? 0) / 0.55),
      }
    })
    .filter(Boolean) as {
    id: string
    team: 'ally' | 'enemy'
    x1: number
    y1: number
    x2: number
    y2: number
    strength: number
  }[]

  return (
    <div
      className={`tactical-map ${live ? 'is-live' : ''} ${interactive ? 'is-interactive' : ''}`}
      style={{ ['--map-accent' as string]: map.accent }}
    >
      <div className="map-plaque">
        <span className="map-plaque-kicker">ARENA</span>
        <strong>{map.name}</strong>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        className="map-svg"
        role="img"
        aria-label={`${map.name} tactical map`}
        onClick={handleClick}
      >
        <defs>
          <radialGradient id={`arena-${map.id}`} cx="50%" cy="48%" r="72%">
            <stop offset="0%" stopColor="#2c241c" />
            <stop offset="45%" stopColor="#1a1714" />
            <stop offset="100%" stopColor="#0c0b0a" />
          </radialGradient>
          <pattern
            id={`tile-${map.id}`}
            width={CELL}
            height={CELL}
            patternUnits="userSpaceOnUse"
          >
            <rect width={CELL} height={CELL} fill="transparent" />
            <path
              d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
              fill="none"
              stroke="rgba(255,220,180,0.035)"
              strokeWidth="0.4"
            />
          </pattern>
          <filter id="wall-depth" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0.6" stdDeviation="0.5" floodColor="#000" floodOpacity="0.55" />
          </filter>
          <linearGradient id="tracer-ally" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(80,220,180,0)" />
            <stop offset="40%" stopColor="rgba(120,255,210,0.95)" />
            <stop offset="100%" stopColor="#fff" />
          </linearGradient>
          <linearGradient id="tracer-enemy" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,122,47,0)" />
            <stop offset="40%" stopColor="rgba(255,180,100,0.95)" />
            <stop offset="100%" stopColor="#fff" />
          </linearGradient>
        </defs>

        {/* Arena bowl */}
        <rect x="0" y="0" width={size} height={size} fill={`url(#arena-${map.id})`} />
        <rect x="0" y="0" width={size} height={size} fill={`url(#tile-${map.id})`} />

        {/* Walkable floor pads — readable geometry without graph lines */}
        <g className="floor-layer">
          {floorPads.map((pad) => (
            <rect
              key={pad.key}
              x={pad.x}
              y={pad.y}
              width={CELL - 1.6}
              height={CELL - 1.6}
              rx="1.1"
              className="floor-pad"
            />
          ))}
        </g>

        {/* Architecture / walls */}
        <g className="wall-layer" filter="url(#wall-depth)">
          {map.blocks.map((b, i) => (
            <rect
              key={i}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={Math.min(1.6, Math.min(b.w, b.h) * 0.12)}
              className="map-block"
            />
          ))}
        </g>

        {/* Bomb sites + spawn plates — architecture cues, not graph edges */}
        {sites.map((z) => (
          <g key={z.id} className="site-marker">
            <rect
              x={z.x - 7}
              y={z.y - 7}
              width="14"
              height="14"
              rx="2"
              className="site-plate"
            />
            <text x={z.x} y={z.y + 2.6} textAnchor="middle" className="site-label">
              {z.site}
            </text>
          </g>
        ))}
        {map.zones
          .filter((z) => z.id === 'tspawn' || z.id === 'ctspawn')
          .map((z) => (
            <text
              key={`spawn-${z.id}`}
              x={z.x}
              y={z.y + 1.8}
              textAnchor="middle"
              className={`spawn-mark ${z.id === 'tspawn' ? 'spawn-t' : 'spawn-ct'}`}
            >
              {z.id === 'tspawn' ? 'T' : 'CT'}
            </text>
          ))}

        {/* Aim lasers — unique broadcast cue while locking a target */}
        <g className="aim-layer">
          {aimBeams.map((b) => (
            <line
              key={b.id}
              x1={b.x1}
              y1={b.y1}
              x2={b.x2}
              y2={b.y2}
              className={`aim-beam ${b.team}`}
              opacity={0.25 + b.strength * 0.55}
              strokeWidth={0.45 + b.strength * 0.55}
            />
          ))}
        </g>

        <g className="gadget-layer">
          {visibleGadgets.map((g) => {
            if (g.kind === 'claymore') {
              const arm = (g.facing * 180) / Math.PI
              const pulsing = g.fuse <= 0
              return (
                <g
                  key={g.id}
                  className={`gadget-claymore ${g.team} ${pulsing ? 'armed' : ''}`}
                  transform={`translate(${g.x} ${g.y}) rotate(${arm})`}
                >
                  <polygon points="0,-2.2 4.5,3.2 -4.5,3.2" className="clay-body" />
                  <line x1="0" y1="0" x2="8" y2="0" className="clay-cone" />
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
                  <circle r={2.2 + (1 - Math.min(1, t)) * 1.1} className="frag-body" />
                  <circle r="0.9" className="frag-pin" />
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
          {fx
            .filter((f) => f.kind !== 'float')
            .map((f) => {
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
                <g key={f.id} className={`fx-shot ${f.team}`} opacity={0.45 + t * 0.55}>
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
                    r={1.3 + (1 - t) * 1.4}
                    className="fx-muzzle"
                  />
                  <g transform={`translate(${f.fromX} ${f.fromY}) rotate(${angle})`}>
                    <polygon
                      points="0,0 3,-1.2 3,1.2"
                      className="fx-muzzle-flare"
                      opacity={t}
                    />
                  </g>
                </g>
              )
            }

            if (f.kind === 'nade') {
              const scale = 0.7 + (1 - t) * 2.6
              return (
                <g
                  key={f.id}
                  className={`fx-nade ${f.team}`}
                  transform={`translate(${f.toX} ${f.toY})`}
                  opacity={Math.min(1, t * 1.5)}
                >
                  <circle r={5 * scale} className="fx-nade-ring" />
                  <circle r={2 * scale} className="fx-nade-core" />
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
                </g>
              )
            }

            if (f.kind === 'hit') {
              const scale = 0.6 + (1 - t) * 1.3
              return (
                <g
                  key={f.id}
                  className={`fx-hit ${f.team}`}
                  transform={`translate(${f.toX} ${f.toY})`}
                  opacity={t}
                >
                  <circle r={2.2 * scale} className="fx-hit-ring" />
                  <circle r={0.9 * scale} className="fx-hit-core" />
                </g>
              )
            }

            const scale = 0.8 + (1 - t) * 2
            return (
              <g
                key={f.id}
                className={`fx-kill ${f.team}`}
                transform={`translate(${f.toX} ${f.toY})`}
                opacity={Math.min(1, t * 1.4)}
              >
                <circle r={3.6 * scale} className="fx-kill-blast" />
                <circle r={1.5 * scale} className="fx-kill-core" />
              </g>
            )
          })}
        </g>

        <g ref={pawnsLayerRef}>
          {players.map((p) => {
            const pos = renderRef.current[p.id] ?? p
            const aiming = !!p.aimTargetId
            return (
              <g
                key={p.id}
                data-pid={p.id}
                className={`pawn ${p.team} ${p.alive ? '' : 'down'} ${
                  p.id === selectedUnitId ? 'selected' : ''
                } ${p.orderedTime > 0 ? 'ordered' : ''} ${
                  p.firingTime > 0 ? 'firing' : ''
                } ${aiming ? 'aiming' : ''}`}
                transform={`translate(${pos.x} ${pos.y})`}
              >
                {/* Operator silhouette — not a plain orb */}
                <circle r="4.6" className="pawn-glow" />
                <circle r="3.3" className="pawn-body" />
                <polygon points="0,-4.8 2.2,-1.6 -2.2,-1.6" className="pawn-chevron" />
                {p.firingTime > 0 && <circle r="5.4" className="pawn-fire-ring" />}
                {p.alive && (
                  <rect x="-4.4" y="4.8" width="8.8" height="1.5" rx="0.4" className="hp-bg" />
                )}
                {p.alive && (
                  <rect
                    x="-4.4"
                    y="4.8"
                    width={8.8 * Math.max(0, p.hp / p.maxHp)}
                    height="1.5"
                    rx="0.4"
                    className={`hp-fill ${p.team}`}
                  />
                )}
                <text y="-6.2" textAnchor="middle" className="pawn-name">
                  {p.name}
                </text>
              </g>
            )
          })}
        </g>

        {/* Kill / cash floats above pawns so they read on broadcast */}
        <g className="float-layer">
          {fx
            .filter((f) => f.kind === 'float')
            .map((f) => {
              const t = f.life / f.maxLife
              const rise = (1 - t) * 14
              return (
                <g
                  key={f.id}
                  className={`fx-float ${f.team} ${
                    f.label?.includes('$') ? 'cash' : 'frag'
                  }`}
                  transform={`translate(${f.fromX} ${f.fromY - rise})`}
                  opacity={Math.min(1, t * 1.8)}
                >
                  <text textAnchor="middle" className="fx-float-label">
                    {f.label ?? 'FRAG'}
                  </text>
                </g>
              )
            })}
        </g>

        {/* Soft edge vignette — dark frame, no blue graph overlay */}
        <rect
          x={0}
          y={0}
          width={size}
          height={size}
          className="map-vignette"
          fill="none"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth={22}
          pointerEvents="none"
        />
      </svg>
    </div>
  )
}
