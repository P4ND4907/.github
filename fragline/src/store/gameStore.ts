import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { LEAGUES } from '../data/names'
import { applyMatchResult, buildStandings, pickOpponent } from '../lib/league'
import {
  createMarket,
  createStarterSquad,
  formatCash,
  marketPrice,
  playerPower,
  skillUpgradeCost,
  squadPower,
} from '../lib/players'
import { createIdleMatch, startMatch, tickMatch } from '../lib/matchSim'
import type { GameState, Player, Screen, SkillKey, Upgrade } from '../types'

export { formatCash, playerPower, marketPrice, skillUpgradeCost }

const DEFAULT_UPGRADES: Upgrade[] = [
  { id: 'firepower', name: 'Firepower', level: 1, powerPerLevel: 1, baseCost: 4200 },
  { id: 'utility', name: 'Utility Pack', level: 1, powerPerLevel: 1, baseCost: 5100 },
  { id: 'comms', name: 'Comms Link', level: 1, powerPerLevel: 2, baseCost: 7800 },
]

function calcIncome(power: number, leagueIndex: number) {
  return Math.max(8, Math.round(power * 0.12 + leagueIndex * 40 + 40))
}

function syncPower(squad: Player[], upgrades: Upgrade[]) {
  const upgradePower = upgrades.reduce((s, u) => s + u.level * u.powerPerLevel * 12, 0)
  return squadPower(squad) + upgradePower
}

interface GameStore extends GameState {
  screen: Screen
  setScreen: (s: Screen) => void
  tick: () => void
  tickLiveMatch: () => void
  playMatch: () => void
  dismissResult: () => void
  buyUpgrade: (id: string) => void
  upgradeSkill: (playerId: string, skill: SkillKey) => void
  selectPlayer: (id: string | null) => void
  buyPlayer: (id: string) => void
  sellPlayer: (id: string) => void
  refreshMarket: () => void
  renameTeam: (name: string) => void
  promoteIfReady: () => void
}

function initialState(): GameState {
  const squad = createStarterSquad()
  const upgrades = DEFAULT_UPGRADES.map((u) => ({ ...u }))
  const teamPower = syncPower(squad, upgrades)
  const teamName = 'My Team'
  return {
    cash: 45000,
    gems: 40,
    incomePerSec: calcIncome(teamPower, 0),
    teamPower,
    teamName,
    leagueIndex: 0,
    matchesPlayed: 0,
    squad,
    selectedPlayerId: squad[0]?.id ?? null,
    upgrades,
    market: createMarket(6, 1),
    standings: buildStandings(teamName, teamPower, 1),
    match: createIdleMatch(),
    lastTick: Date.now(),
    totalWins: 0,
  }
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState(),
      screen: 'home',

      setScreen: (screen) => set({ screen }),

      renameTeam: (name) => {
        const teamName = name.trim().slice(0, 18) || 'My Team'
        set((s) => ({
          teamName,
          standings: s.standings.map((t) =>
            t.isPlayer ? { ...t, name: teamName } : t,
          ),
        }))
      },

      tick: () => {
        const now = Date.now()
        const { lastTick, incomePerSec, match } = get()
        const elapsed = Math.min(60, (now - lastTick) / 1000)
        if (elapsed < 0.25) return
        const earned = incomePerSec * elapsed
        const idleBonus = match.phase === 'idle' ? earned * 0.15 : 0
        set({
          cash: get().cash + earned + idleBonus,
          lastTick: now,
        })
      },

      tickLiveMatch: () => {
        const { match } = get()
        if (match.phase !== 'live') return
        const next = tickMatch(match)
        set({ match: next })

        if (next.phase === 'result' && next.result && next.opponentId) {
          const fragDiff = Math.max(1, Math.abs(next.allyScore - next.enemyScore) * 3 + 2)
          const standings = applyMatchResult(
            get().standings,
            'player',
            next.opponentId,
            next.result,
            fragDiff,
          )
          const reward =
            next.result === 'win'
              ? 18000 + get().teamPower * 8
              : next.result === 'draw'
                ? 7000
                : 2500
          set((s) => ({
            standings,
            matchesPlayed: s.matchesPlayed + 1,
            cash: s.cash + reward,
            totalWins: s.totalWins + (next.result === 'win' ? 1 : 0),
            incomePerSec:
              calcIncome(s.teamPower, s.leagueIndex) + (next.result === 'win' ? 5 : 0),
          }))
        }
      },

      playMatch: () => {
        const s = get()
        if (s.match.phase === 'live') return
        const league = LEAGUES[s.leagueIndex]
        if (s.matchesPlayed >= league.matchesTotal) {
          get().promoteIfReady()
          return
        }
        const opponent = pickOpponent(s.standings)
        if (!opponent) return
        const standings = s.standings.map((t) =>
          t.isPlayer ? { ...t, power: s.teamPower } : t,
        )
        set({
          standings,
          match: startMatch(s.squad, opponent, s.teamPower),
        })
      },

      dismissResult: () => {
        set({ match: createIdleMatch() })
        get().promoteIfReady()
      },

      promoteIfReady: () => {
        const s = get()
        const league = LEAGUES[s.leagueIndex]
        if (s.matchesPlayed < league.matchesTotal) return
        const rank = s.standings.findIndex((t) => t.isPlayer)
        if (rank <= 2 && s.leagueIndex < LEAGUES.length - 1) {
          const leagueIndex = s.leagueIndex + 1
          const teamPower = s.teamPower
          set({
            leagueIndex,
            matchesPlayed: 0,
            standings: buildStandings(s.teamName, teamPower, leagueIndex + 1),
            market: createMarket(6, leagueIndex + 1),
            incomePerSec: calcIncome(teamPower, leagueIndex),
            cash: s.cash + 50000,
            gems: s.gems + 15,
            match: createIdleMatch(),
          })
        } else {
          set({
            matchesPlayed: 0,
            standings: buildStandings(s.teamName, s.teamPower, s.leagueIndex + 1),
            match: createIdleMatch(),
          })
        }
      },

      buyUpgrade: (id) => {
        const s = get()
        const upgrade = s.upgrades.find((u) => u.id === id)
        if (!upgrade) return
        const cost = Math.round(upgrade.baseCost * Math.pow(1.35, upgrade.level - 1))
        if (s.cash < cost) return
        const upgrades = s.upgrades.map((u) =>
          u.id === id ? { ...u, level: u.level + 1 } : u,
        )
        const teamPower = syncPower(s.squad, upgrades)
        set({
          cash: s.cash - cost,
          upgrades,
          teamPower,
          incomePerSec: calcIncome(teamPower, s.leagueIndex),
          standings: s.standings.map((t) =>
            t.isPlayer ? { ...t, power: teamPower } : t,
          ),
        })
      },

      upgradeSkill: (playerId, skill) => {
        const s = get()
        const player = s.squad.find((p) => p.id === playerId)
        if (!player) return
        const value = player.skills[skill]
        if (value >= 99) return
        const cost = skillUpgradeCost(player.level, value)
        if (s.cash < cost) return
        const squad = s.squad.map((p) => {
          if (p.id !== playerId) return p
          const skills = { ...p.skills, [skill]: Math.min(99, value + 1) }
          const leveled = Math.random() > 0.75 ? p.level + 1 : p.level
          return { ...p, skills, level: Math.min(99, leveled) }
        })
        const teamPower = syncPower(squad, s.upgrades)
        set({
          cash: s.cash - cost,
          squad,
          teamPower,
          incomePerSec: calcIncome(teamPower, s.leagueIndex),
          standings: s.standings.map((t) =>
            t.isPlayer ? { ...t, power: teamPower } : t,
          ),
        })
      },

      selectPlayer: (id) => set({ selectedPlayerId: id }),

      buyPlayer: (id) => {
        const s = get()
        const prospect = s.market.find((p) => p.id === id)
        if (!prospect) return
        const price = marketPrice(prospect)
        if (s.cash < price) return
        if (s.squad.length >= 8) return
        const squad = [...s.squad, prospect]
        const market = s.market.filter((p) => p.id !== id)
        const teamPower = syncPower(squad, s.upgrades)
        set({
          cash: s.cash - price,
          squad,
          market,
          selectedPlayerId: prospect.id,
          teamPower,
          incomePerSec: calcIncome(teamPower, s.leagueIndex),
          standings: s.standings.map((t) =>
            t.isPlayer ? { ...t, power: teamPower } : t,
          ),
        })
      },

      sellPlayer: (id) => {
        const s = get()
        if (s.squad.length <= 5) return
        const player = s.squad.find((p) => p.id === id)
        if (!player) return
        const value = Math.round(marketPrice(player) * 0.45)
        const squad = s.squad.filter((p) => p.id !== id)
        const teamPower = syncPower(squad, s.upgrades)
        set({
          cash: s.cash + value,
          squad,
          selectedPlayerId: squad[0]?.id ?? null,
          teamPower,
          incomePerSec: calcIncome(teamPower, s.leagueIndex),
          standings: s.standings.map((t) =>
            t.isPlayer ? { ...t, power: teamPower } : t,
          ),
        })
      },

      refreshMarket: () => {
        const s = get()
        const cost = 2500
        if (s.cash < cost) return
        set({
          cash: s.cash - cost,
          market: createMarket(6, s.leagueIndex + 1),
        })
      },
    }),
    {
      name: 'fragline-save-v1',
      partialize: (s) => ({
        cash: s.cash,
        gems: s.gems,
        incomePerSec: s.incomePerSec,
        teamPower: s.teamPower,
        teamName: s.teamName,
        leagueIndex: s.leagueIndex,
        matchesPlayed: s.matchesPlayed,
        squad: s.squad,
        selectedPlayerId: s.selectedPlayerId,
        upgrades: s.upgrades,
        market: s.market,
        standings: s.standings,
        lastTick: s.lastTick,
        totalWins: s.totalWins,
        match: createIdleMatch(),
      }),
    },
  ),
)

export function upgradeCost(u: Upgrade): number {
  return Math.round(u.baseCost * Math.pow(1.35, u.level - 1))
}
