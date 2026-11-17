import type { WeatherCheck } from '@/components/route-generator/constants'

export type RouteRequest = {
  origin: google.maps.places.Place
  destination: google.maps.places.Place
  weatherCheck: WeatherCheck
}

function parseWeatherPoint(value: unknown) {
  if (
    typeof value !== 'object' || value === null ||
    !('latitude' in value) || typeof value.latitude !== 'number' ||
    !Number.isFinite(value.latitude) || Math.abs(value.latitude) > 90 ||
    !('longitude' in value) || typeof value.longitude !== 'number' ||
    !Number.isFinite(value.longitude) || Math.abs(value.longitude) > 180
  ) {
    throw new Error('The route service returned an invalid weather point.')
  }
  return { latitude: value.latitude, longitude: value.longitude }
}

function parseRoute(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    throw new Error('The route service returned an invalid route.')
  }
  const distance = 'distanceMeters' in value ? value.distanceMeters : 0
  if (
    typeof distance !== 'number' || !Number.isSafeInteger(distance) || distance < 0 ||
    !('duration' in value) || typeof value.duration !== 'string' ||
    !/^\d+(?:\.\d{1,9})?s$/.test(value.duration) ||
    !('polyline' in value) || typeof value.polyline !== 'object' || value.polyline === null ||
    !('encodedPolyline' in value.polyline) || typeof value.polyline.encodedPolyline !== 'string' ||
    !/^[?-~]*$/.test(value.polyline.encodedPolyline)
  ) {
    throw new Error('The route service returned an invalid route.')
  }
  const durationSeconds = Number(value.duration.slice(0, -1))
  if (!Number.isFinite(durationSeconds)) {
    throw new Error('The route service returned an invalid duration.')
  }
  if (!('weather_points' in value) || !Array.isArray(value.weather_points) || value.weather_points.length === 0) {
    throw new Error('The route service returned invalid weather points.')
  }
  return {
    distanceMeters: distance,
    durationSeconds,
    encodedPolyline: value.polyline.encodedPolyline,
    weatherPoints: value.weather_points.map((point: unknown) => parseWeatherPoint(point)),
  }
}

export type Route = ReturnType<typeof parseRoute>

export function parseRoutesResponse(value: unknown): Route[] {
  if (
    typeof value !== 'object' || value === null ||
    !('routes' in value) || !Array.isArray(value.routes)
  ) {
    throw new Error('The route service returned an invalid response.')
  }
  return value.routes.map((route: unknown) => parseRoute(route))
}

export async function requestRoutes({ origin, destination, weatherCheck }: RouteRequest): Promise<Route[]> {
  await Promise.all([
    origin.fetchFields({ fields: ['location'] }),
    destination.fetchFields({ fields: ['location'] }),
  ])
  if (!origin.location || !destination.location) {
    throw new Error('No map location found for a selected address. Please choose another address.')
  }
  const originLocation = origin.location.toJSON()
  const destinationLocation = destination.location.toJSON()
  let response: Response
  try {
    response = await fetch('/api/get_routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { latitude: originLocation.lat, longitude: originLocation.lng },
        destination: { latitude: destinationLocation.lat, longitude: destinationLocation.lng },
        weather_check: weatherCheck,
      }),
      signal: AbortSignal.timeout(35_000),
    })
  } catch {
    throw new Error('Unable to load routes. Please try again.')
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('The route service returned an unreadable response. Please try again.')
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null &&
      'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'Unable to load routes. Please try again.'
    throw new Error(message)
  }
  return parseRoutesResponse(payload)
}
