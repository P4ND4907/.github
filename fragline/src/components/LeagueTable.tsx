import { LEAGUES } from '../data/names'
import { useGameStore } from '../store/gameStore'
import './LeagueTable.css'

export function LeagueTable() {
  const standings = useGameStore((s) => s.standings)
  const leagueIndex = useGameStore((s) => s.leagueIndex)
  const matchesPlayed = useGameStore((s) => s.matchesPlayed)
  const league = LEAGUES[leagueIndex]

  const top = standings.slice(0, 4)
  const youIdx = standings.findIndex((t) => t.isPlayer)
  const you = youIdx >= 0 ? standings[youIdx] : null
  const youOutsideTop = youIdx >= 4
  const rows = youOutsideTop && you ? [...top, you] : standings.slice(0, 5)

  return (
    <section className="panel league-panel">
      <div className="row space league-head">
        <h2>{league.name}</h2>
        <span className="pill">
          MATCHES: {matchesPlayed}/{league.matchesTotal}
        </span>
      </div>

      <div className="table-wrap">
        <table className="league-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>FD</th>
              <th>PTS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((team) => {
              const rank = standings.findIndex((t) => t.id === team.id) + 1
              return (
                <tr key={team.id} className={team.isPlayer ? 'is-you' : undefined}>
                  <td>{rank}</td>
                  <td>
                    <span className="team-name">{team.name}</span>
                  </td>
                  <td>{team.w}</td>
                  <td>{team.d}</td>
                  <td>{team.l}</td>
                  <td className={team.fd >= 0 ? 'pos' : 'neg'}>
                    {team.fd > 0 ? `+${team.fd}` : team.fd}
                  </td>
                  <td>
                    <strong>{team.pts}</strong>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="promo-banner">
        <span>↑</span>
        <p>{league.promotionLabel}</p>
      </div>
    </section>
  )
}
