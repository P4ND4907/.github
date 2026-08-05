export interface MapBlock {
  x: number
  y: number
  w: number
  h: number
}

export interface MapZone {
  id: string
  label: string
  x: number
  y: number
  col: number
  row: number
  site?: 'A' | 'B'
}

export interface GameMap {
  id: string
  name: string
  accent: string
  /** 10×10: true = wall */
  grid: boolean[][]
  blocks: MapBlock[]
  zones: MapZone[]
  edges: [string, string][]
  allySpawns: string[]
  enemySpawns: string[]
  allyPush: string[]
  allyHold: string[]
  enemyPush: string[]
  enemyHold: string[]
}

export interface GridPoint {
  col: number
  row: number
}

const PAWN_R = 2.0
const CELL = 10
const GRID = 10

function cellCenter(col: number, row: number) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 }
}

function fromGrid(
  meta: {
    id: string
    name: string
    accent: string
    rows: string[]
    zones: { id: string; label: string; col: number; row: number; site?: 'A' | 'B' }[]
    edges: [string, string][]
    allySpawns: string[]
    enemySpawns: string[]
    allyPush: string[]
    allyHold: string[]
    enemyPush: string[]
    enemyHold: string[]
  },
): GameMap {
  if (meta.rows.length !== GRID || meta.rows.some((r) => r.length !== GRID)) {
    throw new Error(`Bad grid for ${meta.id}`)
  }

  const grid = meta.rows.map((row) => [...row].map((ch) => ch === '#'))
  const blocks: MapBlock[] = [
    { x: 0, y: 0, w: 100, h: 2.5 },
    { x: 0, y: 97.5, w: 100, h: 2.5 },
    { x: 0, y: 0, w: 2.5, h: 100 },
    { x: 97.5, y: 0, w: 2.5, h: 100 },
  ]

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!grid[r][c]) continue
      blocks.push({
        x: c * CELL + 0.35,
        y: r * CELL + 0.35,
        w: CELL - 0.7,
        h: CELL - 0.7,
      })
    }
  }

  for (const z of meta.zones) {
    if (grid[z.row]?.[z.col]) {
      throw new Error(`Zone ${z.id} on wall in ${meta.id} @${z.col},${z.row}`)
    }
  }

  const zones: MapZone[] = meta.zones.map((z) => {
    const { x, y } = cellCenter(z.col, z.row)
    return { id: z.id, label: z.label, x, y, col: z.col, row: z.row, site: z.site }
  })

  return {
    id: meta.id,
    name: meta.name,
    accent: meta.accent,
    grid,
    blocks,
    zones,
    edges: meta.edges,
    allySpawns: meta.allySpawns,
    enemySpawns: meta.enemySpawns,
    allyPush: meta.allyPush,
    allyHold: meta.allyHold,
    enemyPush: meta.enemyPush,
    enemyHold: meta.enemyHold,
  }
}

/** Open corridors — every zone sits on '.' */
const DUSTLINE = fromGrid({
  id: 'dustline',
  name: 'DUSTLINE',
  accent: '#3aa0ff',
  rows: [
    '##########',
    '#........#',
    '#.##..##.#',
    '#.#....#.#',
    '#...##...#',
    '#.#....#.#',
    '#.##..##.#',
    '#........#',
    '#..#..#..#',
    '##########',
  ],
  zones: [
    { id: 'tspawn', label: 'T Spawn', col: 2, row: 8 },
    { id: 'ctspawn', label: 'CT Spawn', col: 7, row: 1 },
    { id: 'mid', label: 'Mid', col: 3, row: 4 },
    { id: 'xbox', label: 'Xbox', col: 3, row: 5 },
    { id: 'cat', label: 'Cat', col: 6, row: 3 },
    { id: 'a_long', label: 'Long', col: 8, row: 7 },
    { id: 'a_site', label: 'A', col: 8, row: 3, site: 'A' },
    { id: 'a_short', label: 'Short', col: 6, row: 4 },
    { id: 'b_tunnels', label: 'Tunnels', col: 1, row: 5 },
    { id: 'b_site', label: 'B', col: 1, row: 2, site: 'B' },
    { id: 'b_window', label: 'Window', col: 4, row: 2 },
    { id: 'doors', label: 'Doors', col: 3, row: 3 },
  ],
  edges: [
    ['tspawn', 'mid'],
    ['tspawn', 'a_long'],
    ['tspawn', 'b_tunnels'],
    ['mid', 'xbox'],
    ['xbox', 'cat'],
    ['cat', 'a_short'],
    ['a_short', 'a_site'],
    ['a_long', 'a_site'],
    ['b_tunnels', 'b_site'],
    ['b_site', 'b_window'],
    ['b_window', 'doors'],
    ['doors', 'mid'],
    ['ctspawn', 'a_site'],
    ['ctspawn', 'mid'],
    ['ctspawn', 'b_window'],
    ['mid', 'a_short'],
  ],
  allySpawns: ['tspawn', 'mid', 'xbox', 'a_long', 'b_tunnels'],
  enemySpawns: ['ctspawn', 'a_site', 'b_site', 'cat', 'doors'],
  allyPush: ['mid', 'cat', 'a_short', 'a_site', 'b_tunnels', 'b_site', 'xbox'],
  allyHold: ['tspawn', 'mid', 'xbox', 'a_long', 'doors'],
  enemyHold: ['a_site', 'b_site', 'ctspawn', 'cat', 'doors', 'b_window'],
  enemyPush: ['mid', 'xbox', 'a_short', 'doors', 'b_tunnels'],
})

const NEON_MAZE = fromGrid({
  id: 'neon_maze',
  name: 'NEON MAZE',
  accent: '#2fd67b',
  rows: [
    '##########',
    '#.#.#.#..#',
    '#.#...#..#',
    '#.###.#..#',
    '#.....#..#',
    '###.#.##.#',
    '#...#....#',
    '#.###.##.#',
    '#........#',
    '##########',
  ],
  zones: [
    { id: 'tspawn', label: 'South', col: 4, row: 8 },
    { id: 'ctspawn', label: 'North', col: 8, row: 1 },
    { id: 'sw', label: 'SW', col: 1, row: 8 },
    { id: 'se', label: 'SE', col: 8, row: 8 },
    { id: 'nw', label: 'NW', col: 1, row: 1 },
    { id: 'ne', label: 'NE', col: 8, row: 2 },
    { id: 'mid', label: 'Mid', col: 4, row: 4 },
    { id: 'lane1', label: 'Lane 1', col: 2, row: 4 },
    { id: 'lane2', label: 'Lane 2', col: 6, row: 6 },
    { id: 'a_site', label: 'A', col: 8, row: 4, site: 'A' },
    { id: 'b_site', label: 'B', col: 1, row: 4, site: 'B' },
    { id: 'cross', label: 'Cross', col: 4, row: 2 },
  ],
  edges: [
    ['tspawn', 'sw'],
    ['tspawn', 'se'],
    ['sw', 'b_site'],
    ['sw', 'lane1'],
    ['se', 'lane2'],
    ['se', 'a_site'],
    ['b_site', 'nw'],
    ['b_site', 'lane1'],
    ['a_site', 'ne'],
    ['a_site', 'lane2'],
    ['lane1', 'mid'],
    ['lane2', 'mid'],
    ['mid', 'cross'],
    ['cross', 'nw'],
    ['cross', 'ne'],
    ['nw', 'ctspawn'],
    ['ne', 'ctspawn'],
    ['ctspawn', 'a_site'],
  ],
  allySpawns: ['tspawn', 'sw', 'se', 'lane1', 'lane2'],
  enemySpawns: ['ctspawn', 'nw', 'ne', 'a_site', 'b_site'],
  allyPush: ['mid', 'lane1', 'lane2', 'a_site', 'b_site', 'cross'],
  allyHold: ['tspawn', 'sw', 'se', 'lane1'],
  enemyHold: ['ctspawn', 'a_site', 'b_site', 'nw', 'ne'],
  enemyPush: ['mid', 'cross', 'lane1', 'lane2'],
})

const SPLIT_YARD = fromGrid({
  id: 'split_yard',
  name: 'SPLIT YARD',
  accent: '#ff7a2f',
  rows: [
    '##########',
    '#..#..#..#',
    '#........#',
    '#.##.##.##',
    '#.#....#.#',
    '#.#.##.#.#',
    '#.#....#.#',
    '#........#',
    '#..#..#..#',
    '##########',
  ],
  zones: [
    { id: 'tspawn', label: 'Yard S', col: 4, row: 8 },
    { id: 'ctspawn', label: 'Yard N', col: 4, row: 1 },
    { id: 'left_bot', label: 'Left Bot', col: 1, row: 7 },
    { id: 'right_bot', label: 'Right Bot', col: 8, row: 7 },
    { id: 'left_mid', label: 'Left Mid', col: 1, row: 4 },
    { id: 'right_mid', label: 'Right Mid', col: 8, row: 4 },
    { id: 'left_top', label: 'Left Top', col: 1, row: 2 },
    { id: 'right_top', label: 'Right Top', col: 8, row: 2 },
    { id: 'choke', label: 'Choke', col: 4, row: 4 },
    { id: 'a_site', label: 'A', col: 7, row: 1, site: 'A' },
    { id: 'b_site', label: 'B', col: 2, row: 1, site: 'B' },
    { id: 'connector', label: 'Conn', col: 4, row: 2 },
  ],
  edges: [
    ['tspawn', 'left_bot'],
    ['tspawn', 'right_bot'],
    ['tspawn', 'choke'],
    ['left_bot', 'left_mid'],
    ['right_bot', 'right_mid'],
    ['left_mid', 'left_top'],
    ['right_mid', 'right_top'],
    ['left_mid', 'choke'],
    ['right_mid', 'choke'],
    ['choke', 'connector'],
    ['connector', 'ctspawn'],
    ['left_top', 'b_site'],
    ['right_top', 'a_site'],
    ['b_site', 'ctspawn'],
    ['a_site', 'ctspawn'],
    ['left_top', 'ctspawn'],
    ['right_top', 'ctspawn'],
  ],
  allySpawns: ['tspawn', 'left_bot', 'right_bot', 'choke', 'left_mid'],
  enemySpawns: ['ctspawn', 'a_site', 'b_site', 'left_top', 'right_top'],
  allyPush: ['choke', 'connector', 'left_mid', 'right_mid', 'a_site', 'b_site'],
  allyHold: ['tspawn', 'left_bot', 'right_bot', 'choke'],
  enemyHold: ['ctspawn', 'a_site', 'b_site', 'connector', 'left_top'],
  enemyPush: ['choke', 'left_mid', 'right_mid', 'connector'],
})

const RAMPART = fromGrid({
  id: 'rampart',
  name: 'RAMPART',
  accent: '#ffc857',
  rows: [
    '##########',
    '#........#',
    '#.##..##.#',
    '#.#....#.#',
    '#...##...#',
    '#.#....#.#',
    '#.##..##.#',
    '#........#',
    '#...##...#',
    '##########',
  ],
  zones: [
    { id: 'tspawn', label: 'Gate', col: 2, row: 8 },
    { id: 'ctspawn', label: 'Keep', col: 5, row: 1 },
    { id: 'courtyard', label: 'Court', col: 3, row: 4 },
    { id: 'west_hall', label: 'West', col: 1, row: 4 },
    { id: 'east_hall', label: 'East', col: 8, row: 4 },
    { id: 'sw', label: 'SW', col: 1, row: 7 },
    { id: 'se', label: 'SE', col: 8, row: 7 },
    { id: 'nw', label: 'NW', col: 1, row: 2 },
    { id: 'ne', label: 'NE', col: 8, row: 2 },
    { id: 'a_site', label: 'A', col: 8, row: 3, site: 'A' },
    { id: 'b_site', label: 'B', col: 1, row: 3, site: 'B' },
    { id: 'bridge', label: 'Bridge', col: 5, row: 3 },
  ],
  edges: [
    ['tspawn', 'sw'],
    ['tspawn', 'se'],
    ['tspawn', 'courtyard'],
    ['sw', 'west_hall'],
    ['se', 'east_hall'],
    ['west_hall', 'courtyard'],
    ['east_hall', 'courtyard'],
    ['west_hall', 'b_site'],
    ['east_hall', 'a_site'],
    ['courtyard', 'bridge'],
    ['bridge', 'ctspawn'],
    ['b_site', 'nw'],
    ['a_site', 'ne'],
    ['nw', 'ctspawn'],
    ['ne', 'ctspawn'],
    ['b_site', 'bridge'],
    ['a_site', 'bridge'],
  ],
  allySpawns: ['tspawn', 'sw', 'se', 'courtyard', 'west_hall'],
  enemySpawns: ['ctspawn', 'a_site', 'b_site', 'nw', 'ne'],
  allyPush: ['courtyard', 'bridge', 'west_hall', 'east_hall', 'a_site', 'b_site'],
  allyHold: ['tspawn', 'sw', 'se', 'courtyard'],
  enemyHold: ['ctspawn', 'a_site', 'b_site', 'bridge', 'nw'],
  enemyPush: ['courtyard', 'west_hall', 'east_hall', 'bridge'],
})

const CANAL = fromGrid({
  id: 'canal',
  name: 'CANAL',
  accent: '#6ec8ff',
  rows: [
    '##########',
    '#........#',
    '#..####..#',
    '#.#....#.#',
    '#.#.##.#.#',
    '#.#....#.#',
    '#.#.####.#',
    '#........#',
    '#..#..#..#',
    '##########',
  ],
  zones: [
    { id: 'tspawn', label: 'Dock', col: 4, row: 8 },
    { id: 'ctspawn', label: 'Lock', col: 4, row: 1 },
    { id: 'bend_s', label: 'South Bend', col: 4, row: 7 },
    { id: 'bend_n', label: 'North Bend', col: 5, row: 3 },
    { id: 'west_low', label: 'West Low', col: 1, row: 7 },
    { id: 'east_low', label: 'East Low', col: 8, row: 7 },
    { id: 'west_high', label: 'West High', col: 1, row: 3 },
    { id: 'east_high', label: 'East High', col: 8, row: 3 },
    { id: 'mid', label: 'Basin', col: 3, row: 5 },
    { id: 'a_site', label: 'A', col: 8, row: 1, site: 'A' },
    { id: 'b_site', label: 'B', col: 1, row: 1, site: 'B' },
    { id: 'spillway', label: 'Spill', col: 5, row: 5 },
  ],
  edges: [
    ['tspawn', 'bend_s'],
    ['bend_s', 'west_low'],
    ['bend_s', 'east_low'],
    ['bend_s', 'mid'],
    ['west_low', 'west_high'],
    ['east_low', 'east_high'],
    ['mid', 'spillway'],
    ['spillway', 'bend_n'],
    ['west_high', 'b_site'],
    ['east_high', 'a_site'],
    ['bend_n', 'ctspawn'],
    ['b_site', 'ctspawn'],
    ['a_site', 'ctspawn'],
    ['west_high', 'bend_n'],
    ['east_high', 'bend_n'],
    ['mid', 'west_low'],
    ['mid', 'east_low'],
  ],
  allySpawns: ['tspawn', 'bend_s', 'west_low', 'east_low', 'mid'],
  enemySpawns: ['ctspawn', 'a_site', 'b_site', 'bend_n', 'west_high'],
  allyPush: ['mid', 'spillway', 'bend_n', 'a_site', 'b_site', 'west_high'],
  allyHold: ['tspawn', 'bend_s', 'west_low', 'east_low'],
  enemyHold: ['ctspawn', 'a_site', 'b_site', 'bend_n', 'spillway'],
  enemyPush: ['mid', 'spillway', 'west_high', 'east_high'],
})

export const MAPS: GameMap[] = [DUSTLINE, NEON_MAZE, SPLIT_YARD, RAMPART, CANAL]

export function getMap(id: string | null | undefined): GameMap {
  return MAPS.find((m) => m.id === id) ?? MAPS[0]
}

export function pickRandomMap(excludeId?: string | null): GameMap {
  const pool = excludeId ? MAPS.filter((m) => m.id !== excludeId) : MAPS
  return pool[Math.floor(Math.random() * pool.length)] ?? MAPS[0]
}

export function zoneById(map: GameMap, id: string): MapZone {
  return map.zones.find((z) => z.id === id) ?? map.zones[0]
}

export function worldToCell(x: number, y: number): GridPoint {
  return {
    col: Math.max(0, Math.min(GRID - 1, Math.floor(x / CELL))),
    row: Math.max(0, Math.min(GRID - 1, Math.floor(y / CELL))),
  }
}

export function isOpenCell(map: GameMap, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= GRID || row >= GRID) return false
  return !map.grid[row][col]
}

const DIRS: GridPoint[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
]

/** BFS free-roam path through open cells — routes around walls */
export function findGridPath(
  map: GameMap,
  from: GridPoint,
  to: GridPoint,
): GridPoint[] {
  if (!isOpenCell(map, from.col, from.row)) {
    from = nearestOpenCell(map, from.col, from.row)
  }
  if (!isOpenCell(map, to.col, to.row)) {
    to = nearestOpenCell(map, to.col, to.row)
  }
  if (from.col === to.col && from.row === to.row) return [from]

  const key = (c: number, r: number) => `${c},${r}`
  const queue: GridPoint[] = [from]
  const prev = new Map<string, string | null>([[key(from.col, from.row), null]])

  while (queue.length) {
    const cur = queue.shift()!
    for (const d of DIRS) {
      const nc = cur.col + d.col
      const nr = cur.row + d.row
      const k = key(nc, nr)
      if (prev.has(k) || !isOpenCell(map, nc, nr)) continue
      prev.set(k, key(cur.col, cur.row))
      if (nc === to.col && nr === to.row) {
        const path: GridPoint[] = [{ col: nc, row: nr }]
        let p: string | null = key(cur.col, cur.row)
        while (p) {
          const [pc, pr] = p.split(',').map(Number)
          path.push({ col: pc, row: pr })
          p = prev.get(p) ?? null
        }
        return path.reverse()
      }
      queue.push({ col: nc, row: nr })
    }
  }
  return [from]
}

export function nearestOpenCell(map: GameMap, col: number, row: number): GridPoint {
  if (isOpenCell(map, col, row)) return { col, row }
  for (let rad = 1; rad < 8; rad++) {
    for (let dc = -rad; dc <= rad; dc++) {
      for (let dr = -rad; dr <= rad; dr++) {
        if (Math.abs(dc) !== rad && Math.abs(dr) !== rad) continue
        if (isOpenCell(map, col + dc, row + dr)) {
          return { col: col + dc, row: row + dr }
        }
      }
    }
  }
  // fallback first open
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (isOpenCell(map, c, r)) return { col: c, row: r }
    }
  }
  return { col: 1, row: 1 }
}

/** Random open cell for roaming (optionally biased toward a region) */
export function randomOpenCell(map: GameMap, near?: GridPoint, radius = 4): GridPoint {
  const candidates: GridPoint[] = []
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!isOpenCell(map, c, r)) continue
      if (near) {
        const d = Math.abs(c - near.col) + Math.abs(r - near.row)
        if (d > radius || d < 1) continue
      }
      candidates.push({ col: c, row: r })
    }
  }
  if (!candidates.length) {
    return near ? nearestOpenCell(map, near.col, near.row) : { col: 1, row: 1 }
  }
  return candidates[Math.floor(Math.random() * candidates.length)]
}

export function pathToWorld(path: GridPoint[]): { x: number; y: number }[] {
  return path.map((p) => {
    const { x, y } = cellCenter(p.col, p.row)
    // Keep pawns near cell center so they stay in the corridor
    return {
      x: x + (Math.random() * 1.2 - 0.6),
      y: y + (Math.random() * 1.2 - 0.6),
    }
  })
}

export { PAWN_R, CELL, cellCenter }
