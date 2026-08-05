import { MAP_BLOCKS, MAP_ZONES } from '../data/map'
import type { MatchPlayer } from '../types'
import './TacticalMap.css'

interface Props {
  players: MatchPlayer[]
  live?: boolean
}

export function TacticalMap({ players, live }: Props) {
  const sites = MAP_ZONES.filter((z) => z.site)
  const combatHotspots = players.filter((p) => !p.alive).slice(0, 3)

  return (
    <div className={`tactical-map ${live ? 'is-live' : ''}`}>
      <svg viewBox="0 0 100 100" className="map-svg" role="img" aria-label="Tactical map">
        <defs>
          <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.4" />
          </pattern>
          <radialGradient id="floor" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#243041" />
            <stop offset="100%" stopColor="#141a22" />
          </radialGradient>
        </defs>

        <rect x="0" y="0" width="100" height="100" fill="url(#floor)" />
        <rect x="0" y="0" width="100" height="100" fill="url(#grid)" />

        {/* Corridors suggestion */}
        <path
          d="M18 82 L48 48 L78 22"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M18 82 L22 28"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M18 82 L82 72 L78 42"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="7"
          strokeLinecap="round"
        />

        {MAP_BLOCKS.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx="1.5"
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
          <g key={`fx-${p.id}`} className="combat-fx" style={{ transformOrigin: `${p.x}px ${p.y}px` }}>
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
