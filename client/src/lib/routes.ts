import type { WeatherCheck } from '@/components/route-generator/constants'
import { fetchRouteWeather, type Coordinates, type Weather } from "./weather";

export type RouteRequest = {
  origin: google.maps.places.Place
  destination: google.maps.places.Place
  weatherCheck: WeatherCheck
  departureTime: Date
}

export type WeatherPoint = Coordinates & { weather: Weather };

export type Route = {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  weatherPoints: WeatherPoint[];
};

type RouteGeometry = Omit<Route, "weatherPoints"> & {
  weatherPoints: Coordinates[];
};

type RoutesResponse = {
  routes: {
    distanceMeters: number;
    durationSeconds: number;
    polyline: { encodedPolyline: string };
    weather_points: Coordinates[];
  }[];
};

async function requestRouteGeometries({
  origin,
  destination,
  weatherCheck,
}: RouteRequest): Promise<RouteGeometry[]> {
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
  return (payload as RoutesResponse).routes.map((route) => ({
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    encodedPolyline: route.polyline.encodedPolyline,
    weatherPoints: route.weather_points,
  }))
}

export async function requestRoutes(request: RouteRequest): Promise<Route[]> {
  const routes = await requestRouteGeometries(request);
  const weather = await fetchRouteWeather(
    routes.map(({ weatherPoints, durationSeconds }) => ({
      points: weatherPoints,
      durationSeconds,
    })),
    request.departureTime,
  );
  return routes.map((route, routeIndex) => ({
    ...route,
    weatherPoints: route.weatherPoints.map((point, pointIndex) => ({
      ...point,
      weather: weather[routeIndex][pointIndex],
    })),
  }));
}
