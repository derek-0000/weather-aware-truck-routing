import { assessWeather, type WeatherRisk } from './risk'

const FORECAST_API_URL = 'https://api.open-meteo.com/v1/forecast'
const BATCH_SIZE = 10
const CONCURRENCY_RETRIES = 4
const CONCURRENCY_RETRY_DELAY_MS = 300
const REQUEST_TIMEOUT_MS = 20_000
const QUARTER_HOUR_MS = 15 * 60 * 1000

export type Coordinates = { latitude: number; longitude: number }

export type Weather = {
  eta: string
  forecastTime: string
  windMph: number
  rainInph: number
  snowInph: number
  risk: WeatherRisk
}

export type RouteWeatherRequest = { points: Coordinates[]; durationSeconds: number }

type ForecastPoint = Coordinates & { eta: Date; forecastTime: Date }

function nearestQuarterHour(time: number) {
  return Math.floor((time + QUARTER_HOUR_MS / 2) / QUARTER_HOUR_MS) * QUARTER_HOUR_MS
}

function schedule({ points, durationSeconds }: RouteWeatherRequest, departureTime: Date): ForecastPoint[] {
  const intervals = Math.max(points.length - 1, 1)
  return points.map((point, index) => {
    const eta = new Date(departureTime.getTime() + (durationSeconds * 1000 * index) / intervals)
    const forecastTime = new Date(nearestQuarterHour(eta.getTime()))
    if (!Number.isFinite(forecastTime.getTime())) {
      throw new Error("The route's arrival times are outside the supported forecast range.")
    }
    return { ...point, eta, forecastTime }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonnegative(value: unknown, multiplier = 1) {
  const number = typeof value === 'number' ? value * multiplier : NaN
  if (!Number.isFinite(number) || number < 0) {
    throw new Error('Open-Meteo returned missing or invalid weather data.')
  }
  return number
}

function parseForecast(payload: unknown, point: ForecastPoint, loadWeightLbs: number): Weather {
  if (!isRecord(payload) || 'error' in payload) {
    throw new Error('Open-Meteo returned an invalid forecast.')
  }
  const series = payload.minutely_15
  const units = payload.minutely_15_units
  if (!isRecord(series) || !isRecord(units)) {
    throw new Error('Open-Meteo returned an invalid forecast.')
  }
  if (
    units.time !== 'unixtime' ||
    (units.wind_speed_10m !== 'mp/h' && units.wind_speed_10m !== 'mph') ||
    units.rain !== 'inch' ||
    units.snowfall !== 'inch'
  ) {
    throw new Error('Open-Meteo returned unexpected forecast units.')
  }
  const times = series.time
  if (!Array.isArray(times) || !times.every((time) => Number.isSafeInteger(time))) {
    throw new Error('Open-Meteo returned invalid forecast times.')
  }
  if (times.some((time, index) => index > 0 && time - times[index - 1] !== QUARTER_HOUR_MS / 1000)) {
    throw new Error('Open-Meteo returned an unexpected forecast interval.')
  }
  const index = times.indexOf(point.forecastTime.getTime() / 1000)
  if (index === -1) {
    throw new Error("No forecast is available at a weather point's ETA.")
  }
  const value = (field: string, multiplier = 1) => {
    const data = series[field]
    if (!Array.isArray(data) || data.length !== times.length) {
      throw new Error('Open-Meteo returned invalid forecast values.')
    }
    return nonnegative(data[index], multiplier)
  }
  const conditions = {
    windMph: value('wind_speed_10m'),
    rainInph: value('rain', 4),
    snowInph: value('snowfall', 4),
  }
  return {
    eta: point.eta.toISOString(),
    forecastTime: point.forecastTime.toISOString(),
    ...conditions,
    // Score each point as soon as its forecast arrives.
    risk: assessWeather(conditions, loadWeightLbs),
  }
}

async function isConcurrencyLimit(response: Response) {
  try {
    const body: unknown = await response.clone().json()
    return isRecord(body) && typeof body.reason === 'string' && /concurrent/i.test(body.reason)
  } catch {
    return false
  }
}

async function get(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    } catch (error) {
      throw new Error(
        error instanceof DOMException && error.name === 'TimeoutError'
          ? 'Open-Meteo request timed out.'
          : 'Could not connect to Open-Meteo.',
      )
    }
    if (
      response.status !== 429 ||
      attempt === CONCURRENCY_RETRIES ||
      !(await isConcurrencyLimit(response))
    ) {
      return response
    }
    const delay = CONCURRENCY_RETRY_DELAY_MS * 2 ** attempt * (0.5 + Math.random())
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

async function fetchForecast(point: ForecastPoint, loadWeightLbs: number): Promise<Weather> {
  const forecastMinute = point.forecastTime.toISOString().slice(0, 16)
  const params = new URLSearchParams({
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    minutely_15: 'wind_speed_10m,rain,snowfall',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'GMT',
    timeformat: 'unixtime',
    start_minutely_15: forecastMinute,
    end_minutely_15: forecastMinute,
  })
  const response = await get(`${FORECAST_API_URL}?${params}`)
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'))
    throw new Error(
      Number.isFinite(seconds) && seconds > 0
        ? `Open-Meteo is rate limiting this device. Please try again in ${Math.ceil(seconds)} seconds.`
        : 'Open-Meteo is rate limiting this device. Please try again later.',
    )
  }
  if (!response.ok) {
    throw new Error('Open-Meteo could not provide forecasts for the requested arrival times.')
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Open-Meteo returned invalid JSON.')
  }
  return parseForecast(payload, point, loadWeightLbs)
}

async function fetchInBatches(points: ForecastPoint[], loadWeightLbs: number): Promise<Weather[]> {
  const results: Weather[] = []
  for (let start = 0; start < points.length; start += BATCH_SIZE) {
    const batch = points.slice(start, start + BATCH_SIZE)
    results.push(...(await Promise.all(batch.map((point) => fetchForecast(point, loadWeightLbs)))))
  }
  return results
}

export async function fetchRouteWeather(
  routes: RouteWeatherRequest[],
  departureTime: Date,
  loadWeightLbs: number,
): Promise<Weather[][]> {
  const scheduled = routes.map((route) => schedule(route, departureTime))
  const results = await fetchInBatches(scheduled.flat(), loadWeightLbs)
  let next = 0
  return scheduled.map((points) => points.map(() => results[next++]))
}
