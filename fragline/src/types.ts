export type PlayerRole = 'ENT' | 'IGL' | 'SUP' | 'LURK' | 'AWP'

export type SkillKey =
  | 'aim'
  | 'reflex'
  | 'recoil'
  | 'positioning'
  | 'utility'
  | 'clutch'

export interface Skills {
  aim: number
  reflex: number
  recoil: number
  positioning: number
  utility: number
  clutch: number
}

export interface Player {
  id: string
  name: string
  role: PlayerRole
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legend'
  nationality: string
  skills: Skills
  level: number
}

export interface Team {
  id: string
  name: string
  tag: string
  power: number
  w: number
  d: number
  l: number
  fd: number
  pts: number
  isPlayer?: boolean
}

export interface League {
  id: string
  name: string
  tier: number
  matchesTotal: number
  promotionLabel: string
}

export interface Upgrade {
  id: string
  name: string
  blurb: string
  icon: string
  level: number
  powerPerLevel: number
  baseCost: number
  stat: UpgradeStat
}

export type UpgradeStat =
  | 'power'
  | 'intelligence'
  | 'strategy'
  | 'reflex'
  | 'utility'
  | 'clutch'

export type Screen = 'home' | 'squad' | 'market' | 'career'

export type MatchPhase = 'idle' | 'live' | 'result'

export interface CombatFx {
  id: string
  kind: 'shot' | 'hit' | 'kill'
  fromX: number
  fromY: number
  toX: number
  toY: number
  team: 'ally' | 'enemy'
  /** Seconds remaining to display */
  life: number
  maxLife: number
}

export interface MatchPlayer {
  id: string
  /** Links to squad Player.id for allies; null for AI */
  squadId: string | null
  name: string
  team: 'ally' | 'enemy'
  x: number
  y: number
  alive: boolean
  hp: number
  maxHp: number
  /** Individual combat rating from unit skills */
  combat: number
  /** Per-unit move speed multiplier */
  speed: number
  targetX: number
  targetY: number
  waypoints: { x: number; y: number }[]
  /** Seconds remaining where AI won't override a manual move order */
  orderedTime: number
  /** Seconds of muzzle-flash / recoil pose */
  firingTime: number
}

export interface MatchState {
  phase: MatchPhase
  round: number
  maxRounds: number
  allyScore: number
  enemyScore: number
  timeLeft: number
  winChance: number
  mapId: string
  mapName: string
  players: MatchPlayer[]
  events: string[]
  opponentId: string | null
  result: 'win' | 'draw' | 'loss' | null
  selectedUnitId: string | null
  /** World marker for last issued move order */
  orderMarker: { x: number; y: number } | null
  fx: CombatFx[]
}

export interface GameState {
  cash: number
  gems: number
  incomePerSec: number
  teamPower: number
  teamName: string
  leagueIndex: number
  matchesPlayed: number
  squad: Player[]
  selectedPlayerId: string | null
  upgrades: Upgrade[]
  market: Player[]
  standings: Team[]
  match: MatchState
  lastTick: number
  totalWins: number
}
