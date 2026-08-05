import { TEAM_POOL } from '../data/names'
import type { Team } from '../types'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function buildStandings(teamName: string, teamPower: number, tier: number): Team[] {
  const rivals = shuffle(TEAM_POOL).slice(0, 7)
  const teams: Team[] = [
    {
      id: 'player',
      name: teamName,
      tag: 'YOU',
      power: teamPower,
      w: 0,
      d: 0,
      l: 0,
      fd: 0,
      pts: 0,
      isPlayer: true,
    },
    ...rivals.map((t, i) => {
      const power = Math.round(teamPower * (0.72 + Math.random() * 0.5) + tier * 40 + i * 8)
      return {
        id: `ai_${i}_${t.tag}`,
        name: t.name,
        tag: t.tag,
        power,
        w: 0,
        d: 0,
        l: 0,
        fd: 0,
        pts: 0,
      }
    }),
  ]

  // Seed some early results so the table feels alive
  for (const team of teams) {
    if (team.isPlayer) continue
    const games = Math.floor(Math.random() * 3)
    for (let g = 0; g < games; g++) {
      const roll = Math.random()
      if (roll < 0.45) {
        team.w += 1
        team.pts += 3
        team.fd += Math.floor(Math.random() * 8) + 2
      } else if (roll < 0.6) {
        team.d += 1
        team.pts += 1
      } else {
        team.l += 1
        team.fd -= Math.floor(Math.random() * 8) + 1
      }
    }
  }

  return sortStandings(teams)
}

export function sortStandings(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.fd !== a.fd) return b.fd - a.fd
    return b.w - a.w
  })
}

export function applyMatchResult(
  standings: Team[],
  playerId: string,
  opponentId: string,
  result: 'win' | 'draw' | 'loss',
  fragDiff: number,
): Team[] {
  const next = standings.map((t) => ({ ...t }))
  const player = next.find((t) => t.id === playerId)
  const opponent = next.find((t) => t.id === opponentId)
  if (!player || !opponent) return sortStandings(next)

  if (result === 'win') {
    player.w += 1
    player.pts += 3
    player.fd += fragDiff
    opponent.l += 1
    opponent.fd -= fragDiff
  } else if (result === 'draw') {
    player.d += 1
    player.pts += 1
    opponent.d += 1
    opponent.pts += 1
  } else {
    player.l += 1
    player.fd -= fragDiff
    opponent.w += 1
    opponent.pts += 3
    opponent.fd += fragDiff
  }

  // Nudge AI matches slightly so table moves
  for (const team of next) {
    if (team.id === playerId || team.id === opponentId) continue
    if (Math.random() > 0.35) continue
    const roll = Math.random()
    if (roll < 0.5) {
      team.w += 1
      team.pts += 3
      team.fd += Math.floor(Math.random() * 5) + 1
    } else if (roll < 0.7) {
      team.d += 1
      team.pts += 1
    } else {
      team.l += 1
      team.fd -= Math.floor(Math.random() * 5) + 1
    }
  }

  return sortStandings(next)
}

export function pickOpponent(standings: Team[]): Team | null {
  const foes = standings.filter((t) => !t.isPlayer)
  if (!foes.length) return null
  return foes[Math.floor(Math.random() * foes.length)]
}
