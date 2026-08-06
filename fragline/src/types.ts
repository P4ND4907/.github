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
  kind: 'shot' | 'hit' | 'kill' | 'nade' | 'claymore' | 'float'
  fromX: number
  fromY: number
  toX: number
  toY: number
  team: 'ally' | 'enemy'
  life: number
  maxLife: number
  /** Floating text for kill/cash celebration */
  label?: string
  amount?: number
}

export type GadgetKind = 'claymore' | 'frag' | 'smoke'

export interface Gadget {
  id: string
  kind: GadgetKind
  team: 'ally' | 'enemy'
  x: number
  y: number
  /** Claymore facing angle in radians */
  facing: number
  /** Seconds until armed / fuse */
  fuse: number
  /** Revealed to the opposing team (intel spot) */
  spotted: boolean
  ownerId: string
}

export interface MatchPlayer {
  id: string
  /** Links to squad Player.id for allies; null for AI */
  squadId: string | null
  name: string
  team: 'ally' | 'enemy'
  role: PlayerRole
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
  /** Seconds with no progress toward target — triggers unstuck repath */
  stuckTime: number
  /** Stick to current path — stops slingshot repathing */
  commitTime: number
  /** Locked engagement target id */
  aimTargetId: string | null
  /** Seconds spent acquiring the current aim target */
  aimTime: number
  /** Seconds until next shot allowed */
  fireCooldown: number
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
  gadgets: Gadget[]
  /** Cash granted this tick from frags — store drains it */
  pendingCash: number
  /** Ally frag streak this round for dopamine copy */
  fragStreak: number
  /** Peak frag streak this match — used for learning XP */
  peakStreak: number
  /** XP earned this tick from smart plays — store drains into brain */
  pendingXp: number
  /** Live lesson strings emitted this tick */
  pendingLessons: string[]
  /** Big round-end callout shown on map */
  roundBanner: string | null
  /** Seconds left to show roundBanner */
  bannerTime: number
  /** Active IGL callout biasing AI this round */
  callout: string | null
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
  /** Strategy-idle brain — learns from matches & studies while idle */
  brain: TacticalBrain
}

export interface Playbook {
  holds: number
  flanks: number
  utility: number
  aggression: number
  clutch: number
}

export interface TacticalBrain {
  iq: number
  xp: number
  xpToNext: number
  playbook: Playbook
  /** Familiarity 0–100 per map id */
  mapMemory: Record<string, number>
  lessons: string[]
  /** XP gained per second while idle studying */
  studyRate: number
  matchesLearned: number
  idleStudying: boolean
}
