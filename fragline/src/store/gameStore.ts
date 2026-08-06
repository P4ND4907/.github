import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { LEAGUES } from '../data/names'
import { applyMatchResult, buildStandings, pickOpponent } from '../lib/league'
import {
  brainPowerBonus,
  createBrain,
  grantXp,
  idleStudy,
  learnFromMatch,
} from '../lib/learning'
import {
  createMarket,
  createStarterSquad,
  formatCash,
  marketPrice,
  playerPower,
  skillUpgradeCost,
  squadPower,
} from '../lib/players'
import {
  createIdleMatch,
  startMatch,
  tickMatch,
  commandHoldAngle,
  commandPushSite,
  commandUnitTo,
  selectMatchUnit as selectUnitInMatch,
  syncAllyStats,
} from '../lib/matchSim'
import type { GameState, Player, Screen, SkillKey, Upgrade } from '../types'

export { formatCash, playerPower, marketPrice, skillUpgradeCost }

let lastMatchTickAt = 0

const DEFAULT_UPGRADES: Upgrade[] = [
  {
    id: 'power',
    name: 'Power',
    blurb: 'Raw aim & damage — raises win chance in gunfights',
    icon: '⚡',
    level: 1,
    powerPerLevel: 2,
    baseCost: 4200,
    stat: 'power',
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    blurb: 'Spots enemy claymores more often — % chance scales with level',
    icon: '◎',
    level: 1,
    powerPerLevel: 1,
    baseCost: 4800,
    stat: 'intelligence',
  },
  {
    id: 'strategy',
    name: 'Strategy',
    blurb: 'Hold angles & flanks — smarter site timing',
    icon: '▣',
    level: 1,
    powerPerLevel: 2,
    baseCost: 5600,
    stat: 'strategy',
  },
  {
    id: 'reflex',
    name: 'Reflex',
    blurb: 'Faster movement across the map',
    icon: '›',
    level: 1,
    powerPerLevel: 1,
    baseCost: 3900,
    stat: 'reflex',
  },
  {
    id: 'utility',
    name: 'Utility',
    blurb: 'More claymores & frags — bigger nade blasts',
    icon: '◌',
    level: 1,
    powerPerLevel: 1,
    baseCost: 5100,
    stat: 'utility',
  },
  {
    id: 'clutch',
    name: 'Clutch',
    blurb: 'Late-round and low-man advantage',
    icon: '▲',
    level: 1,
    powerPerLevel: 2,
    baseCost: 7200,
    stat: 'clutch',
  },
]

function calcIncome(power: number, leagueIndex: number, iq = 1) {
  return Math.max(8, Math.round(power * 0.12 + leagueIndex * 40 + 40 + iq * 2.5))
}

function syncPower(
  squad: Player[],
  upgrades: Upgrade[],
  brainIqBonus = 0,
) {
  const upgradePower = upgrades.reduce(
    (s, u) => s + u.level * u.powerPerLevel * 18,
    0,
  )
  return squadPower(squad) + upgradePower + brainIqBonus
}

interface GameStore extends GameState {
  screen: Screen
  setScreen: (s: Screen) => void
  tick: () => void
  tickLiveMatch: () => void
  playMatch: () => void
  dismissResult: () => void
  cycleMap: () => void
  selectMatchUnit: (id: string) => void
  commandSelectedUnit: (x: number, y: number) => void
  holdSelectedUnit: () => void
  pushSelectedToSite: () => void
  scoutRival: () => void
  buyUpgrade: (id: string) => void
  upgradeSkill: (playerId: string, skill: SkillKey) => void
  selectPlayer: (id: string | null) => void
  buyPlayer: (id: string) => void
  sellPlayer: (id: string) => void
  refreshMarket: () => void
  renameTeam: (name: string) => void
  promoteIfReady: () => void
  toggleStudying: () => void
  lastUpgradeId: string | null
  lastUpgradeAt: number
}

function initialState(): GameState {
  const squad = createStarterSquad()
  const upgrades = DEFAULT_UPGRADES.map((u) => ({ ...u }))
  const brain = createBrain()
  const teamPower = syncPower(squad, upgrades, brainPowerBonus(brain))
  const teamName = 'My Team'
  return {
    cash: 45000,
    gems: 40,
    incomePerSec: calcIncome(teamPower, 0, brain.iq),
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
    brain,
  }
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialState(),
      screen: 'home',
      lastUpgradeId: null,
      lastUpgradeAt: 0,

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

      toggleStudying: () => {
        const brain = get().brain
        set({
          brain: { ...brain, idleStudying: !brain.idleStudying },
        })
      },

      tick: () => {
        const now = Date.now()
        const { lastTick, incomePerSec, match, brain } = get()
        const elapsed = Math.min(60, (now - lastTick) / 1000)
        if (elapsed < 0.25) return
        const earned = incomePerSec * elapsed
        const idleBonus = match.phase === 'idle' ? earned * 0.15 : 0

        // Strategy idle: squad studies while not in a live match
        let nextBrain = brain ?? createBrain()
        if (match.phase !== 'live') {
          nextBrain = idleStudy(nextBrain, elapsed)
        }

        const teamPower = syncPower(
          get().squad,
          get().upgrades,
          brainPowerBonus(nextBrain),
        )

        set({
          cash: get().cash + earned + idleBonus,
          lastTick: now,
          brain: nextBrain,
          teamPower,
          incomePerSec: calcIncome(teamPower, get().leagueIndex, nextBrain.iq),
          standings: get().standings.map((t) =>
            t.isPlayer ? { ...t, power: teamPower } : t,
          ),
        })
      },

      tickLiveMatch: () => {
        const { match, upgrades, brain } = get()
        if (match.phase !== 'live') return
        const now = performance.now()
        const dt = lastMatchTickAt
          ? Math.min(0.08, Math.max(0.012, (now - lastMatchTickAt) / 1000))
          : 1 / 30
        lastMatchTickAt = now
        const next = tickMatch(match, upgrades, dt, brain)
        const payout = next.pendingCash || 0

        let nextBrain = brain ?? createBrain()
        if (next.pendingXp > 0) {
          nextBrain = grantXp(nextBrain, next.pendingXp)
        }
        for (const lesson of next.pendingLessons ?? []) {
          nextBrain = {
            ...nextBrain,
            lessons: [lesson, ...nextBrain.lessons].slice(0, 8),
          }
        }

        const teamPower = syncPower(
          get().squad,
          upgrades,
          brainPowerBonus(nextBrain),
        )

        set({
          match: { ...next, pendingCash: 0, pendingXp: 0, pendingLessons: [] },
          cash: payout > 0 ? get().cash + payout : get().cash,
          brain: nextBrain,
          teamPower,
        })

        if (next.phase === 'result' && next.result && next.opponentId) {
          lastMatchTickAt = 0
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
              ? 22000 + get().teamPower * 10
              : next.result === 'draw'
                ? 9000
                : 3500
          const nearMiss =
            next.result === 'loss' &&
            Math.abs(next.allyScore - next.enemyScore) <= 2
              ? 4000
              : 0

          const learned = learnFromMatch(
            nextBrain,
            next.result,
            next.mapId,
            next.allyScore,
            next.enemyScore,
            next.peakStreak ?? 0,
          )
          const power = syncPower(
            get().squad,
            get().upgrades,
            brainPowerBonus(learned),
          )

          set((s) => ({
            standings,
            matchesPlayed: s.matchesPlayed + 1,
            cash: s.cash + reward + nearMiss,
            totalWins: s.totalWins + (next.result === 'win' ? 1 : 0),
            brain: learned,
            teamPower: power,
            incomePerSec:
              calcIncome(power, s.leagueIndex, learned.iq) +
              (next.result === 'win' ? 8 : next.result === 'draw' ? 2 : 0),
            match: {
              ...next,
              pendingCash: 0,
              pendingXp: 0,
              pendingLessons: [],
              events: [
                ...(nearMiss > 0
                  ? [...next.events, 'Close one — +$4K bounce-back']
                  : next.events),
                learned.lessons[0] ? `Brain · ${learned.lessons[0]}` : 'Brain updated',
              ].slice(-10),
            },
          }))
        }
      },

      playMatch: () => {
        lastMatchTickAt = 0
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
          match: startMatch(
            s.squad,
            opponent,
            s.teamPower,
            s.match.mapId,
            s.upgrades,
            s.brain,
          ),
        })
      },

      dismissResult: () => {
        set({ match: createIdleMatch(get().match.mapId) })
        get().promoteIfReady()
      },

      cycleMap: () => {
        const s = get()
        if (s.match.phase !== 'idle') return
        set({ match: createIdleMatch(s.match.mapId) })
      },

      selectMatchUnit: (id) => {
        const s = get()
        if (s.match.phase !== 'live') return
        set({ match: selectUnitInMatch(s.match, id) })
      },

      commandSelectedUnit: (x, y) => {
        const s = get()
        if (s.match.phase !== 'live') return
        const id = s.match.selectedUnitId
        if (!id) return
        set({ match: commandUnitTo(s.match, id, x, y) })
      },

      holdSelectedUnit: () => {
        const s = get()
        if (s.match.phase !== 'live') return
        const id = s.match.selectedUnitId
        if (!id) return
        set({ match: commandHoldAngle(s.match, id) })
      },

      pushSelectedToSite: () => {
        const s = get()
        if (s.match.phase !== 'live') return
        const id = s.match.selectedUnitId
        if (!id) return
        set({ match: commandPushSite(s.match, id) })
      },

      scoutRival: () => {
        const s = get()
        if (s.gems < 5) return
        const rival = s.standings.find((t) => !t.isPlayer)
        if (!rival) return
        const lesson = `Scouted ${rival.name} — expect ${
          rival.power > s.teamPower ? 'aggressive defaults' : 'passive stacks'
        }`
        set({
          gems: s.gems - 5,
          brain: grantXp(s.brain, 12, lesson),
          match: {
            ...s.match,
            events: [...s.match.events, lesson].slice(-8),
            roundBanner: s.match.phase === 'idle' ? `SCOUT · ${rival.tag}` : s.match.roundBanner,
            bannerTime: s.match.phase === 'idle' ? 1.6 : s.match.bannerTime,
          },
        })
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
            incomePerSec: calcIncome(teamPower, leagueIndex, s.brain.iq),
            cash: s.cash + 50000,
            gems: s.gems + 15,
            match: createIdleMatch(s.match.mapId),
            brain: grantXp(s.brain, 40, `Promoted — IQ drills unlocked`),
          })
        } else {
          set({
            matchesPlayed: 0,
            standings: buildStandings(s.teamName, s.teamPower, s.leagueIndex + 1),
            match: createIdleMatch(s.match.mapId),
          })
        }
      },

      buyUpgrade: (id) => {
        const s = get()
        const upgrade = s.upgrades.find((u) => u.id === id)
        if (!upgrade) return
        const cost = Math.round(upgrade.baseCost * Math.pow(1.35, upgrade.level - 1))
        if (s.cash < cost) return
        const nextLevel = upgrade.level + 1
        const upgrades = s.upgrades.map((u) =>
          u.id === id ? { ...u, level: nextLevel } : u,
        )
        const teamPower = syncPower(s.squad, upgrades, brainPowerBonus(s.brain))
        const live = s.match.phase === 'live'
        const match = live
          ? {
              ...s.match,
              winChance: Math.min(92, s.match.winChance + (upgrade.stat === 'power' ? 2 : 1)),
              events: [
                ...s.match.events,
                `${upgrade.name} ONLINE · Lv.${nextLevel}`,
              ].slice(-10),
              roundBanner: `${upgrade.name.toUpperCase()} ONLINE`,
              bannerTime: 1.35,
            }
          : s.match
        set({
          cash: s.cash - cost,
          upgrades,
          teamPower,
          match,
          incomePerSec: calcIncome(teamPower, s.leagueIndex, s.brain.iq),
          standings: s.standings.map((t) =>
            t.isPlayer ? { ...t, power: teamPower } : t,
          ),
          lastUpgradeId: id,
          lastUpgradeAt: Date.now(),
          brain: grantXp(s.brain, 6, `${upgrade.name} integrated into playbook`),
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
        const teamPower = syncPower(squad, s.upgrades, brainPowerBonus(s.brain))
        const match =
          s.match.phase === 'live' ? syncAllyStats(s.match, squad) : s.match
        set({
          cash: s.cash - cost,
          squad,
          teamPower,
          match,
          incomePerSec: calcIncome(teamPower, s.leagueIndex, s.brain.iq),
          standings: s.standings.map((t) =>
            t.isPlayer ? { ...t, power: teamPower } : t,
          ),
          brain: grantXp(s.brain, 2.5),
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
        const teamPower = syncPower(squad, s.upgrades, brainPowerBonus(s.brain))
        set({
          cash: s.cash - price,
          squad,
          market,
          selectedPlayerId: prospect.id,
          teamPower,
          incomePerSec: calcIncome(teamPower, s.leagueIndex, s.brain.iq),
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
        const teamPower = syncPower(squad, s.upgrades, brainPowerBonus(s.brain))
        set({
          cash: s.cash + value,
          squad,
          selectedPlayerId: squad[0]?.id ?? null,
          teamPower,
          incomePerSec: calcIncome(teamPower, s.leagueIndex, s.brain.iq),
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
      name: 'fragline-save-v3',
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
        brain: s.brain,
        match: createIdleMatch(),
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState>
        const savedLevels = new Map(
          (p.upgrades ?? []).map((u) => [u.id, u.level]),
        )
        const upgrades = DEFAULT_UPGRADES.map((u) => ({
          ...u,
          level: savedLevels.get(u.id) ?? 1,
        }))
        const brain = { ...createBrain(), ...(p.brain ?? {}) }
        brain.playbook = { ...createBrain().playbook, ...(p.brain?.playbook ?? {}) }
        brain.mapMemory = p.brain?.mapMemory ?? {}
        brain.lessons = p.brain?.lessons?.length
          ? p.brain.lessons
          : createBrain().lessons
        const squad = p.squad ?? current.squad
        const teamPower = syncPower(squad, upgrades, brainPowerBonus(brain))
        return {
          ...current,
          ...p,
          upgrades,
          brain,
          teamPower,
          incomePerSec: calcIncome(teamPower, p.leagueIndex ?? 0, brain.iq),
          match: createIdleMatch(),
          screen: current.screen,
        }
      },
    },
  ),
)

export function upgradeCost(u: Upgrade): number {
  return Math.round(u.baseCost * Math.pow(1.35, u.level - 1))
}
