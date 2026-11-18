import type { RiskLevel, WeatherRisk } from './risk'
import type { Coordinates } from './weather'

const EARTH_RADIUS_METERS = 6_371_008.8
const METERS_PER_MILE = 1609.344

const HIGH: RiskLevel = 2
const SEVERE: RiskLevel = 3
const NO_TRAVEL: RiskLevel = 4

const MILES_PRECISION = 0.1
const AVERAGE_RISK_PRECISION = 0.01

export type RouteEvaluation = {
  disqualified: boolean
  severeMiles: number
  highMiles: number
  averageRisk: number
}

type ScoredPoint = Coordinates & { weather: { risk: Pick<WeatherRisk, 'level'> } }

type RankableRoute = { durationSeconds: number; evaluation: RouteEvaluation }

function haversineMeters(start: Coordinates, end: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const startLatitude = toRadians(start.latitude)
  const endLatitude = toRadians(end.latitude)
  const a =
    Math.sin((endLatitude - startLatitude) / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(toRadians(end.longitude - start.longitude) / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(Math.max(a, 0), 1)))
}

function shareOfRoute(points: Coordinates[]): number[] {
  const gaps = points.slice(1).map((point, index) => haversineMeters(points[index], point))
  const total = gaps.reduce((sum, gap) => sum + gap, 0)
  return points.map((_, index) =>
    total > 0 ? ((gaps[index - 1] ?? 0) + (gaps[index] ?? 0)) / 2 / total : 1 / points.length,
  )
}

export function evaluateRoute({
  distanceMeters,
  weatherPoints,
}: {
  distanceMeters: number
  weatherPoints: ScoredPoint[]
}): RouteEvaluation {
  const routeMiles = distanceMeters / METERS_PER_MILE
  const shares = shareOfRoute(weatherPoints)
  const evaluation: RouteEvaluation = { disqualified: false, severeMiles: 0, highMiles: 0, averageRisk: 0 }
  weatherPoints.forEach(({ weather: { risk } }, index) => {
    const miles = shares[index] * routeMiles
    if (risk.level === NO_TRAVEL) evaluation.disqualified = true
    if (risk.level === SEVERE) evaluation.severeMiles += miles
    if (risk.level === HIGH) evaluation.highMiles += miles
    evaluation.averageRisk += shares[index] * risk.level
  })
  return evaluation
}

function steps(value: number, precision: number) {
  return Math.round(value / precision)
}

export function compareRoutes(routeA: RankableRoute, routeB: RankableRoute) {
  const a = routeA.evaluation
  const b = routeB.evaluation
  return (
    Number(a.disqualified) - Number(b.disqualified) ||
    steps(a.severeMiles, MILES_PRECISION) - steps(b.severeMiles, MILES_PRECISION) ||
    steps(a.highMiles, MILES_PRECISION) - steps(b.highMiles, MILES_PRECISION) ||
    steps(a.averageRisk, AVERAGE_RISK_PRECISION) - steps(b.averageRisk, AVERAGE_RISK_PRECISION) ||
    routeA.durationSeconds - routeB.durationSeconds
  )
}

export function rankRoutes<T extends RankableRoute>(routes: T[]): (T & { recommended: boolean })[] {
  return routes
    .toSorted(compareRoutes)
    .map((route, index) => ({ ...route, recommended: index === 0 && !route.evaluation.disqualified }))
}
