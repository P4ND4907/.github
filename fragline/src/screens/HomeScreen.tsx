import { BrainPanel } from '../components/BrainPanel'
import { LeagueTable } from '../components/LeagueTable'
import { MatchPanel } from '../components/MatchPanel'
import { UpgradePanel } from '../components/UpgradePanel'

export function HomeScreen() {
  return (
    <div className="screen stack">
      <MatchPanel />
      <BrainPanel />
      <UpgradePanel />
      <LeagueTable />
    </div>
  )
}
