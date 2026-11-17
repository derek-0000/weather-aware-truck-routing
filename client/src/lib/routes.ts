export type RouteRequest = {
  origin: google.maps.places.Place
  destination: google.maps.places.Place
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
  return {
    distanceMeters: distance,
    durationSeconds,
    encodedPolyline: value.polyline.encodedPolyline,
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

export async function requestRoutes({ origin, destination }: RouteRequest): Promise<Route[]> {
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
