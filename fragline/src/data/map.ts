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
  size: number
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
  flankZones: string[]
}

export interface GridPoint {
  col: number
  row: number
}

const PAWN_R = 2.2
export const CELL = 10
export const GRID = 16
export const WORLD = GRID * CELL
/** Soft radius — units can't occupy the same space */
export const UNIT_SEP = 5.0

function cellCenter(col: number, row: number) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 }
}

function normalizeRows(rows: string[]): string[] {
  return rows.map((r, i) => {
    let s = r.replace(/[^.#]/g, '')
    if (s.length > GRID) s = s.slice(0, GRID)
    while (s.length < GRID) s += '#'
    if (s.length !== GRID) throw new Error(`Row ${i} len ${s.length}`)
    return s
  })
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
    flankZones: string[]
  },
): GameMap {
  const rows = normalizeRows(meta.rows)
  if (rows.length !== GRID) throw new Error(`Bad row count ${meta.id}`)

  const grid = rows.map((row) => [...row].map((ch) => ch === '#'))
  const blocks: MapBlock[] = [
    { x: 0, y: 0, w: WORLD, h: 2 },
    { x: 0, y: WORLD - 2, w: WORLD, h: 2 },
    { x: 0, y: 0, w: 2, h: WORLD },
    { x: WORLD - 2, y: 0, w: 2, h: WORLD },
  ]

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!grid[r][c]) continue
      blocks.push({
        x: c * CELL + 0.45,
        y: r * CELL + 0.45,
        w: CELL - 0.9,
        h: CELL - 0.9,
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
    size: WORLD,
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
    flankZones: meta.flankZones,
  }
}

/** Wide 16×16 layouts — multiple routes + hold angles */
const DUSTLINE = fromGrid({
  id: 'dustline',
  name: 'DUSTLINE',
  accent: '#3aa0ff',
  rows: [
    '################',
    '#..............#',
    '#.##..####..##.#',
    '#.#..........#.#',
    '#.#.##....##.#.#',
    '#....##..##....#',
    '#.##........##.#',
    '#.#...####...#.#',
    '#.#...####...#.#',
    '#.##........##.#',
    '#....##..##....#',
    '#.#.##....##.#.#',
    '#.#..........#.#',
    '#.##..####..##.#',
    '#..............#',
    '################',
  ],
  zones: [
    { id: 'tspawn', label: 'T Spawn', col: 3, row: 14 },
    { id: 'tspawn2', label: 'T Ramp', col: 8, row: 14 },
    { id: 'tspawn3', label: 'T Side', col: 12, row: 14 },
    { id: 'ctspawn', label: 'CT Spawn', col: 12, row: 1 },
    { id: 'ctspawn2', label: 'CT Mid', col: 8, row: 1 },
    { id: 'ctspawn3', label: 'CT Side', col: 3, row: 1 },
    { id: 'mid', label: 'Mid', col: 5, row: 8 },
    { id: 'mid_b', label: 'Mid B', col: 10, row: 8 },
    { id: 'mid_south', label: 'Mid S', col: 8, row: 10 },
    { id: 'mid_north', label: 'Mid N', col: 8, row: 5 },
    { id: 'a_long', label: 'Long', col: 14, row: 12 },
    { id: 'a_short', label: 'Short', col: 12, row: 8 },
    { id: 'a_site', label: 'A', col: 14, row: 3, site: 'A' },
    { id: 'b_tunnels', label: 'Tunnels', col: 1, row: 10 },
    { id: 'b_site', label: 'B', col: 1, row: 3, site: 'B' },
    { id: 'b_window', label: 'Window', col: 3, row: 5 },
    { id: 'cat', label: 'Cat', col: 11, row: 6 },
    { id: 'doors', label: 'Doors', col: 4, row: 6 },
    { id: 'flank_l', label: 'L Flank', col: 1, row: 7 },
    { id: 'flank_r', label: 'R Flank', col: 14, row: 7 },
  ],
  edges: [
    ['tspawn', 'mid_south'],
    ['tspawn2', 'mid_south'],
    ['tspawn3', 'a_long'],
    ['tspawn', 'b_tunnels'],
    ['mid_south', 'mid'],
    ['mid_south', 'mid_b'],
    ['mid', 'mid_north'],
    ['mid_b', 'mid_north'],
    ['mid', 'doors'],
    ['mid_b', 'cat'],
    ['doors', 'b_window'],
    ['b_window', 'b_site'],
    ['b_tunnels', 'b_site'],
    ['b_tunnels', 'flank_l'],
    ['flank_l', 'b_site'],
    ['cat', 'a_short'],
    ['a_short', 'a_site'],
    ['a_long', 'a_site'],
    ['a_long', 'flank_r'],
    ['flank_r', 'a_site'],
    ['ctspawn', 'a_site'],
    ['ctspawn2', 'mid_north'],
    ['ctspawn3', 'b_site'],
    ['a_site', 'cat'],
    ['b_site', 'doors'],
  ],
  allySpawns: ['tspawn', 'tspawn2', 'tspawn3', 'mid_south', 'b_tunnels'],
  enemySpawns: ['ctspawn', 'ctspawn2', 'ctspawn3', 'a_site', 'b_site'],
  allyPush: ['mid', 'mid_b', 'a_short', 'a_site', 'b_site', 'flank_l', 'flank_r', 'cat'],
  allyHold: ['tspawn', 'mid_south', 'doors', 'a_long', 'b_tunnels'],
  enemyHold: ['a_site', 'b_site', 'ctspawn', 'mid_north', 'cat', 'doors'],
  enemyPush: ['mid', 'mid_south', 'doors', 'cat', 'flank_l', 'flank_r'],
  flankZones: ['flank_l', 'flank_r', 'a_long', 'b_tunnels', 'doors', 'cat'],
})

const NEON_MAZE = fromGrid({
  id: 'neon_maze',
  name: 'NEON MAZE',
  accent: '#2fd67b',
  rows: [
    '################',
    '#.#.#.#.#.#.#..#',
    '#.#...#...#.#..#',
    '#.###.#.###.#.##',
    '#.....#.....#..#',
    '###.#.###.#.##.#',
    '#...#.....#....#',
    '#.###.###.###.##',
    '#.....#.....#..#',
    '##.###.###.#.#.#',
    '#.....#...#...##',
    '#.###.#.###.##.#',
    '#.#...#.....#..#',
    '#.#.#.###.#.#..#',
    '#..............#',
    '################',
  ],
  zones: [
    { id: 'tspawn', label: 'South', col: 7, row: 14 },
    { id: 'sw', label: 'SW', col: 1, row: 14 },
    { id: 'se', label: 'SE', col: 14, row: 14 },
    { id: 'ctspawn', label: 'North', col: 14, row: 1 },
    { id: 'nw', label: 'NW', col: 1, row: 1 },
    { id: 'ne', label: 'NE', col: 13, row: 1 },
    { id: 'mid', label: 'Core', col: 7, row: 8 },
    { id: 'lane1', label: 'W Lane', col: 3, row: 6 },
    { id: 'lane2', label: 'E Lane', col: 11, row: 8 },
    { id: 'cross', label: 'Cross', col: 7, row: 4 },
    { id: 'a_site', label: 'A', col: 14, row: 4, site: 'A' },
    { id: 'b_site', label: 'B', col: 1, row: 4, site: 'B' },
    { id: 'flank_l', label: 'L Cut', col: 1, row: 10 },
    { id: 'flank_r', label: 'R Cut', col: 13, row: 12 },
    { id: 'hub', label: 'Hub', col: 7, row: 14 },
  ],
  edges: [
    ['tspawn', 'hub'],
    ['tspawn', 'sw'],
    ['tspawn', 'se'],
    ['hub', 'mid'],
    ['sw', 'flank_l'],
    ['se', 'flank_r'],
    ['flank_l', 'lane1'],
    ['flank_r', 'lane2'],
    ['lane1', 'mid'],
    ['lane2', 'mid'],
    ['mid', 'cross'],
    ['cross', 'nw'],
    ['cross', 'ne'],
    ['lane1', 'b_site'],
    ['lane2', 'a_site'],
    ['b_site', 'nw'],
    ['a_site', 'ne'],
    ['nw', 'ctspawn'],
    ['ne', 'ctspawn'],
    ['ctspawn', 'a_site'],
  ],
  allySpawns: ['tspawn', 'sw', 'se', 'hub', 'lane1'],
  enemySpawns: ['ctspawn', 'nw', 'ne', 'a_site', 'b_site'],
  allyPush: ['mid', 'cross', 'a_site', 'b_site', 'lane1', 'lane2', 'flank_l', 'flank_r'],
  allyHold: ['tspawn', 'hub', 'sw', 'se', 'lane1'],
  enemyHold: ['ctspawn', 'a_site', 'b_site', 'cross', 'nw'],
  enemyPush: ['mid', 'hub', 'lane1', 'lane2', 'flank_l'],
  flankZones: ['flank_l', 'flank_r', 'lane1', 'lane2', 'hub'],
})

const SPLIT_YARD = fromGrid({
  id: 'split_yard',
  name: 'SPLIT YARD',
  accent: '#ff7a2f',
  rows: [
    '################',
    '#..#..#..#..#..#',
    '#..............#',
    '#.##.##.##.##.##',
    '#.#..........#.#',
    '#.#.##....##.#.#',
    '#.#..........#.#',
    '#....##..##....#',
    '#....##..##....#',
    '#.#..........#.#',
    '#.#.##....##.#.#',
    '#.#..........#.#',
    '#.##.##.##.##.##',
    '#..............#',
    '#..#..#..#..#..#',
    '################',
  ],
  zones: [
    { id: 'tspawn', label: 'Yard S', col: 7, row: 14 },
    { id: 'left_bot', label: 'L Bot', col: 1, row: 13 },
    { id: 'right_bot', label: 'R Bot', col: 14, row: 13 },
    { id: 'choke', label: 'Choke', col: 7, row: 7 },
    { id: 'left_mid', label: 'L Mid', col: 1, row: 7 },
    { id: 'right_mid', label: 'R Mid', col: 14, row: 7 },
    { id: 'connector', label: 'Conn', col: 7, row: 5 },
    { id: 'left_top', label: 'L Top', col: 1, row: 2 },
    { id: 'right_top', label: 'R Top', col: 14, row: 2 },
    { id: 'ctspawn', label: 'Yard N', col: 7, row: 1 },
    { id: 'a_site', label: 'A', col: 13, row: 1, site: 'A' },
    { id: 'b_site', label: 'B', col: 2, row: 1, site: 'B' },
    { id: 'flank_l', label: 'L Deep', col: 1, row: 5 },
    { id: 'flank_r', label: 'R Deep', col: 14, row: 5 },
  ],
  edges: [
    ['tspawn', 'left_bot'],
    ['tspawn', 'right_bot'],
    ['tspawn', 'choke'],
    ['left_bot', 'left_mid'],
    ['right_bot', 'right_mid'],
    ['left_mid', 'choke'],
    ['right_mid', 'choke'],
    ['left_mid', 'flank_l'],
    ['right_mid', 'flank_r'],
    ['flank_l', 'left_top'],
    ['flank_r', 'right_top'],
    ['choke', 'connector'],
    ['connector', 'ctspawn'],
    ['left_top', 'b_site'],
    ['right_top', 'a_site'],
    ['b_site', 'ctspawn'],
    ['a_site', 'ctspawn'],
  ],
  allySpawns: ['tspawn', 'left_bot', 'right_bot', 'choke', 'left_mid'],
  enemySpawns: ['ctspawn', 'a_site', 'b_site', 'left_top', 'right_top'],
  allyPush: ['choke', 'connector', 'left_mid', 'right_mid', 'a_site', 'b_site', 'flank_l', 'flank_r'],
  allyHold: ['tspawn', 'left_bot', 'right_bot', 'choke'],
  enemyHold: ['ctspawn', 'a_site', 'b_site', 'connector', 'left_top'],
  enemyPush: ['choke', 'left_mid', 'right_mid', 'connector', 'flank_l'],
  flankZones: ['flank_l', 'flank_r', 'left_mid', 'right_mid'],
})

const RAMPART = fromGrid({
  id: 'rampart',
  name: 'RAMPART',
  accent: '#ffc857',
  rows: [
    '################',
    '#..............#',
    '#.##..####..##.#',
    '#.#..........#.#',
    '#.#.##....##.#.#',
    '#....#....#....#',
    '#.##........##.#',
    '#.#...####...#.#',
    '#.#...####...#.#',
    '#.##........##.#',
    '#....#....#....#',
    '#.#.##....##.#.#',
    '#.#..........#.#',
    '#.##..####..##.#',
    '#..............#',
    '################',
  ],
  zones: [
    { id: 'tspawn', label: 'Gate', col: 4, row: 14 },
    { id: 'sw', label: 'SW', col: 1, row: 13 },
    { id: 'se', label: 'SE', col: 14, row: 13 },
    { id: 'courtyard', label: 'Court', col: 6, row: 9 },
    { id: 'west_hall', label: 'West', col: 1, row: 8 },
    { id: 'east_hall', label: 'East', col: 14, row: 8 },
    { id: 'bridge', label: 'Bridge', col: 6, row: 5 },
    { id: 'nw', label: 'NW', col: 1, row: 2 },
    { id: 'ne', label: 'NE', col: 14, row: 2 },
    { id: 'ctspawn', label: 'Keep', col: 8, row: 1 },
    { id: 'a_site', label: 'A', col: 14, row: 3, site: 'A' },
    { id: 'b_site', label: 'B', col: 1, row: 3, site: 'B' },
    { id: 'flank_l', label: 'W Cut', col: 1, row: 5 },
    { id: 'flank_r', label: 'E Cut', col: 14, row: 5 },
  ],
  edges: [
    ['tspawn', 'sw'],
    ['tspawn', 'se'],
    ['tspawn', 'courtyard'],
    ['sw', 'west_hall'],
    ['se', 'east_hall'],
    ['west_hall', 'courtyard'],
    ['east_hall', 'courtyard'],
    ['west_hall', 'flank_l'],
    ['east_hall', 'flank_r'],
    ['flank_l', 'b_site'],
    ['flank_r', 'a_site'],
    ['courtyard', 'bridge'],
    ['bridge', 'ctspawn'],
    ['b_site', 'nw'],
    ['a_site', 'ne'],
    ['nw', 'ctspawn'],
    ['ne', 'ctspawn'],
  ],
  allySpawns: ['tspawn', 'sw', 'se', 'courtyard', 'west_hall'],
  enemySpawns: ['ctspawn', 'a_site', 'b_site', 'nw', 'ne'],
  allyPush: ['courtyard', 'bridge', 'west_hall', 'east_hall', 'a_site', 'b_site', 'flank_l', 'flank_r'],
  allyHold: ['tspawn', 'sw', 'se', 'courtyard'],
  enemyHold: ['ctspawn', 'a_site', 'b_site', 'bridge', 'nw'],
  enemyPush: ['courtyard', 'west_hall', 'east_hall', 'bridge'],
  flankZones: ['flank_l', 'flank_r', 'west_hall', 'east_hall'],
})

const CANAL = fromGrid({
  id: 'canal',
  name: 'CANAL',
  accent: '#6ec8ff',
  rows: [
    '################',
    '#..............#',
    '#..##########..#',
    '#.#..........#.#',
    '#.#.##....##.#.#',
    '#.#..........#.#',
    '#.#.##....##.#.#',
    '#.#..........#.#',
    '#.#..........#.#',
    '#.#.##....##.#.#',
    '#.#..........#.#',
    '#.#.##....##.#.#',
    '#.#..........#.#',
    '#..##########..#',
    '#..............#',
    '################',
  ],
  zones: [
    { id: 'tspawn', label: 'Dock', col: 7, row: 14 },
    { id: 'bend_s', label: 'S Bend', col: 7, row: 12 },
    { id: 'west_low', label: 'W Low', col: 1, row: 12 },
    { id: 'east_low', label: 'E Low', col: 14, row: 12 },
    { id: 'mid', label: 'Basin', col: 7, row: 8 },
    { id: 'spillway', label: 'Spill', col: 7, row: 5 },
    { id: 'west_high', label: 'W High', col: 1, row: 3 },
    { id: 'east_high', label: 'E High', col: 14, row: 3 },
    { id: 'bend_n', label: 'N Bend', col: 7, row: 3 },
    { id: 'ctspawn', label: 'Lock', col: 7, row: 1 },
    { id: 'a_site', label: 'A', col: 14, row: 1, site: 'A' },
    { id: 'b_site', label: 'B', col: 1, row: 1, site: 'B' },
    { id: 'flank_l', label: 'W Run', col: 1, row: 7 },
    { id: 'flank_r', label: 'E Run', col: 14, row: 7 },
  ],
  edges: [
    ['tspawn', 'bend_s'],
    ['bend_s', 'west_low'],
    ['bend_s', 'east_low'],
    ['bend_s', 'mid'],
    ['west_low', 'flank_l'],
    ['east_low', 'flank_r'],
    ['flank_l', 'west_high'],
    ['flank_r', 'east_high'],
    ['mid', 'spillway'],
    ['spillway', 'bend_n'],
    ['west_high', 'b_site'],
    ['east_high', 'a_site'],
    ['bend_n', 'ctspawn'],
    ['b_site', 'ctspawn'],
    ['a_site', 'ctspawn'],
    ['mid', 'flank_l'],
    ['mid', 'flank_r'],
  ],
  allySpawns: ['tspawn', 'bend_s', 'west_low', 'east_low', 'mid'],
  enemySpawns: ['ctspawn', 'a_site', 'b_site', 'bend_n', 'west_high'],
  allyPush: ['mid', 'spillway', 'bend_n', 'a_site', 'b_site', 'flank_l', 'flank_r'],
  allyHold: ['tspawn', 'bend_s', 'west_low', 'east_low'],
  enemyHold: ['ctspawn', 'a_site', 'b_site', 'bend_n', 'spillway'],
  enemyPush: ['mid', 'spillway', 'flank_l', 'flank_r'],
  flankZones: ['flank_l', 'flank_r', 'west_low', 'east_low'],
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
  { col: 1, row: 1 },
  { col: 1, row: -1 },
  { col: -1, row: 1 },
  { col: -1, row: -1 },
]

export function findGridPath(
  map: GameMap,
  from: GridPoint,
  to: GridPoint,
): GridPoint[] {
  if (!isOpenCell(map, from.col, from.row)) from = nearestOpenCell(map, from.col, from.row)
  if (!isOpenCell(map, to.col, to.row)) to = nearestOpenCell(map, to.col, to.row)
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
      // No cutting corners through walls on diagonals
      if (d.col !== 0 && d.row !== 0) {
        if (!isOpenCell(map, cur.col + d.col, cur.row)) continue
        if (!isOpenCell(map, cur.col, cur.row + d.row)) continue
      }
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
  for (let rad = 1; rad < 12; rad++) {
    for (let dc = -rad; dc <= rad; dc++) {
      for (let dr = -rad; dr <= rad; dr++) {
        if (Math.abs(dc) !== rad && Math.abs(dr) !== rad) continue
        if (isOpenCell(map, col + dc, row + dr)) return { col: col + dc, row: row + dr }
      }
    }
  }
  return { col: 1, row: 1 }
}

export function randomOpenCell(map: GameMap, near?: GridPoint, radius = 5): GridPoint {
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
  return path.map((p, i) => {
    const { x, y } = cellCenter(p.col, p.row)
    return {
      x: x + ((i % 3) - 1) * 0.5,
      y: y + (((i + 1) % 3) - 1) * 0.5,
    }
  })
}

export function hasLineOfSight(
  map: GameMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const dx = x1 - x0
  const dy = y1 - y0
  const dist = Math.hypot(dx, dy)
  if (dist < 0.5) return true
  const steps = Math.max(10, Math.ceil(dist / 2))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + dx * t
    const y = y0 + dy * t
    const cell = worldToCell(x, y)
    if (!isOpenCell(map, cell.col, cell.row)) return false
    for (const b of map.blocks) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return false
    }
  }
  return true
}

export { PAWN_R, cellCenter }
