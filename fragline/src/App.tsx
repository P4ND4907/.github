import { useEffect } from 'react'
import { BottomNav } from './components/BottomNav'
import { Header } from './components/Header'
import { CareerScreen } from './screens/CareerScreen'
import { HomeScreen } from './screens/HomeScreen'
import { MarketScreen } from './screens/MarketScreen'
import { SquadScreen } from './screens/SquadScreen'
import { useGameStore } from './store/gameStore'

export default function App() {
  const screen = useGameStore((s) => s.screen)
  const tick = useGameStore((s) => s.tick)
  const tickLiveMatch = useGameStore((s) => s.tickLiveMatch)
  const matchPhase = useGameStore((s) => s.match.phase)

  useEffect(() => {
    const id = window.setInterval(() => tick(), 500)
    return () => window.clearInterval(id)
  }, [tick])

  useEffect(() => {
    if (matchPhase !== 'live') return
    const id = window.setInterval(() => tickLiveMatch(), 550)
    return () => window.clearInterval(id)
  }, [matchPhase, tickLiveMatch])

  return (
    <div className="app-shell">
      <Header />
      {screen === 'home' && <HomeScreen />}
      {screen === 'squad' && <SquadScreen />}
      {screen === 'market' && <MarketScreen />}
      {screen === 'career' && <CareerScreen />}
      <BottomNav />
    </div>
  )
}
