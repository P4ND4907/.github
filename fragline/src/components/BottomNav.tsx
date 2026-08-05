import { useGameStore } from '../store/gameStore'
import type { Screen } from '../types'
import './BottomNav.css'

const ITEMS: { id: Screen; label: string; icon: string }[] = [
  { id: 'home', label: 'Match', icon: '◎' },
  { id: 'squad', label: 'Squad', icon: '▣' },
  { id: 'market', label: 'Market', icon: '⇄' },
  { id: 'career', label: 'Career', icon: '▲' },
]

export function BottomNav() {
  const screen = useGameStore((s) => s.screen)
  const setScreen = useGameStore((s) => s.setScreen)

  return (
    <nav className="bottom-nav" aria-label="Main">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={screen === item.id ? 'nav-item active' : 'nav-item'}
          onClick={() => setScreen(item.id)}
        >
          <span className="nav-icon" aria-hidden>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
