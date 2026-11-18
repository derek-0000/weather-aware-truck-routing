export type RiskLevel = 0 | 1 | 2 | 3 | 4

export const RISK_LEVELS = [
  { label: 'Low', color: '#34d399' },
  { label: 'Moderate', color: '#facc15' },
  { label: 'High', color: '#f97316' },
  { label: 'Severe', color: '#ef4444' },
  { label: 'No travel', color: '#d946ef' },
] as const

export const MAX_RISK_LEVEL = (RISK_LEVELS.length - 1) as RiskLevel

export type WeatherRisk = {
  wind: RiskLevel
  rain: RiskLevel
  snow: RiskLevel
  level: RiskLevel
  windLoadAdjusted: boolean
}

/**
 * Heavier loads are more exposed to wind. Each entry raises the wind level to
 * `level` when the wind is at least `minWindMph` and the load exceeds `minLoadLbs`.
 * (Wind of 55 mph or more is already No travel for any load.)
 */
const WIND_LOAD_MODIFIERS: readonly { minWindMph: number; minLoadLbs: number; level: RiskLevel }[] = [
  { minWindMph: 45, minLoadLbs: 30_000, level: 4 },
  { minWindMph: 35, minLoadLbs: 40_000, level: 3 },
]

function windLevelForLoad(windMph: number, loadWeightLbs: number, level: RiskLevel): RiskLevel {
  const modifier = WIND_LOAD_MODIFIERS.find(
    ({ minWindMph, minLoadLbs }) => windMph >= minWindMph && loadWeightLbs > minLoadLbs,
  )
  return modifier && modifier.level > level ? modifier.level : level
}

type Scale = {
  /** Inclusive lower bounds of Moderate, High and Severe. */
  bounds: readonly [number, number, number]
  /** Lower bound of No travel. */
  noTravel: number
  noTravelInclusive: boolean
}

const WIND_MPH: Scale = { bounds: [25, 35, 45], noTravel: 55, noTravelInclusive: true }
const RAIN_INPH: Scale = { bounds: [0.1, 0.25, 0.5], noTravel: 1, noTravelInclusive: false }
const SNOW_INPH: Scale = { bounds: [0.5, 1, 2], noTravel: 3, noTravelInclusive: false }

function classify(value: number, { bounds, noTravel, noTravelInclusive }: Scale): RiskLevel {
  if (noTravelInclusive ? value >= noTravel : value > noTravel) return 4
  if (value >= bounds[2]) return 3
  if (value >= bounds[1]) return 2
  if (value >= bounds[0]) return 1
  return 0
}

export function worstRisk(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((worst, level) => (level > worst ? level : worst), 0)
}

export function assessWeather(
  {
    windMph,
    rainInph,
    snowInph,
  }: {
    windMph: number
    rainInph: number
    snowInph: number
  },
  loadWeightLbs: number,
): WeatherRisk {
  const windWeather = classify(windMph, WIND_MPH)
  const wind = windLevelForLoad(windMph, loadWeightLbs, windWeather)
  const rain = classify(rainInph, RAIN_INPH)
  const snow = classify(snowInph, SNOW_INPH)
  return {
    wind,
    rain,
    snow,
    level: worstRisk([wind, rain, snow]),
    windLoadAdjusted: wind !== windWeather,
  }
}
