import { getMap } from '../data/map'
import type { MatchPlayer } from '../types'
import './TacticalMap.css'

interface Props {
  players: MatchPlayer[]
  mapId?: string | null
  live?: boolean
}

export function TacticalMap({ players, mapId, live }: Props) {
  const map = getMap(mapId)
  const sites = map.zones.filter((z) => z.site)
  const combatHotspots = players.filter((p) => !p.alive).slice(0, 3)

  // Draw corridor hints from graph edges
  const corridors = map.edges
    .map(([a, b]) => {
      const za = map.zones.find((z) => z.id === a)
      const zb = map.zones.find((z) => z.id === b)
      if (!za || !zb) return null
      return { x1: za.x, y1: za.y, x2: zb.x, y2: zb.y, key: `${a}-${b}` }
    })
    .filter(Boolean) as { x1: number; y1: number; x2: number; y2: number; key: string }[]

  return (
    <div
      className={`tactical-map ${live ? 'is-live' : ''}`}
      style={{ ['--map-accent' as string]: map.accent }}
    >
      <svg
        viewBox="0 0 100 100"
        className="map-svg"
        role="img"
        aria-label={`${map.name} tactical map`}
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

        {combatHotspots.map((p) => (
          <g key={`fx-${p.id}`} className="combat-fx">
            <circle cx={p.x} cy={p.y} r="3.2" className="fx-glow" />
            <path
              d={`M ${p.x} ${p.y - 2.2} L ${p.x + 1.2} ${p.y + 1.6} L ${p.x - 1.2} ${p.y + 1.6} Z`}
              className="fx-flame"
            />
          </g>
        ))}

        {players.map((p) => (
          <g
            key={p.id}
            className={`pawn ${p.team} ${p.alive ? '' : 'down'}`}
            transform={`translate(${p.x} ${p.y})`}
          >
            <circle r="3.1" className="pawn-body" />
            <circle r="3.8" className="pawn-ring" />
            <text y="-4.8" textAnchor="middle" className="pawn-name">
              {p.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
