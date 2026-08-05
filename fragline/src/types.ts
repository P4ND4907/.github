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
  /** Contribution to displayed team power */
  powerPerLevel: number
  baseCost: number
  /** Which match stat this upgrades */
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

export interface MatchPlayer {
  id: string
  name: string
  team: 'ally' | 'enemy'
  x: number
  y: number
  alive: boolean
  targetX: number
  targetY: number
  /** World waypoints along free-roam grid path (around walls) */
  waypoints: { x: number; y: number }[]
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
