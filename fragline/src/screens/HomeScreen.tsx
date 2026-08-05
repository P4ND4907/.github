import { LeagueTable } from '../components/LeagueTable'
import { MatchPanel } from '../components/MatchPanel'
import { UpgradePanel } from '../components/UpgradePanel'

export function HomeScreen() {
  return (
    <div className="screen stack">
      <LeagueTable />
      <MatchPanel />
      <UpgradePanel />
    </div>
  )
}
