import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'

export type Place = { prefecture?: string | null; country?: string | null }

/** « Ratoma · Conakry » for a prefecture code, the country name for a diaspora item, undefined when neither is set. */
export function placeName(it: Place): string | undefined {
  if (it.prefecture) { const p = prefectures.find((x) => x.code === it.prefecture); return p ? `${p.name} · ${p.region}` : it.prefecture }
  if (it.country) return countries.find((c) => c.iso === it.country)?.name ?? it.country
  return undefined
}

export function regionOf(prefecture: string | null | undefined): string | undefined {
  return prefecture ? prefectures.find((p) => p.code === prefecture)?.region : undefined
}

export const REGIONS = Array.from(new Set(prefectures.map((p) => p.region)))
export const MISSION_ISOS = countries.filter((c) => c.iso !== 'XX').map((c) => c.iso)
