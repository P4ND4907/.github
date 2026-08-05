/** Normalized 0–100 coordinates for a Dust2-inspired tactical layout */
export interface MapZone {
  id: string
  label: string
  x: number
  y: number
  site?: 'A' | 'B'
}

export const MAP_ZONES: MapZone[] = [
  { id: 'tspawn', label: 'T Spawn', x: 18, y: 82 },
  { id: 'ctspawn', label: 'CT Spawn', x: 78, y: 22 },
  { id: 'mid', label: 'Mid', x: 48, y: 48 },
  { id: 'xbox', label: 'Xbox', x: 42, y: 55 },
  { id: 'cat', label: 'Cat', x: 58, y: 38 },
  { id: 'a_long', label: 'Long', x: 82, y: 72 },
  { id: 'a_site', label: 'A', x: 78, y: 42, site: 'A' },
  { id: 'a_short', label: 'Short', x: 68, y: 48 },
  { id: 'b_tunnels', label: 'Tunnels', x: 22, y: 55 },
  { id: 'b_site', label: 'B', x: 22, y: 28, site: 'B' },
  { id: 'b_window', label: 'Window', x: 32, y: 32 },
  { id: 'doors', label: 'Doors', x: 38, y: 38 },
]

export const MAP_PATHS: [string, string][] = [
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
]

/** Rough building footprints for the SVG map */
export const MAP_BLOCKS = [
  { x: 8, y: 70, w: 22, h: 22 },
  { x: 70, y: 62, w: 22, h: 28 },
  { x: 62, y: 30, w: 28, h: 24 },
  { x: 8, y: 18, w: 28, h: 22 },
  { x: 38, y: 40, w: 18, h: 14 },
  { x: 52, y: 8, w: 20, h: 16 },
]
