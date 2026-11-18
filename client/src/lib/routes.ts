import type { WeatherCheck } from '@/components/route-generator/constants'
import { worstRisk, type RiskLevel } from './risk'
import { evaluateRoute, rankRoutes, type RouteEvaluation } from './route-evaluator'
import { fetchRouteWeather, type Coordinates, type Weather } from "./weather";

const PRODUCTION_API_BASE_URL = 'https://server-eight-sigma-66.vercel.app'

const API_BASE_URL = import.meta.env.PROD ? PRODUCTION_API_BASE_URL : ''

export type RouteRequest = {
  origin: google.maps.places.Place
  destination: google.maps.places.Place
  weatherCheck: WeatherCheck
  departureTime: Date
  loadWeightLbs: number
}

export type WeatherPoint = Coordinates & { weather: Weather };

export type Route = {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  weatherPoints: WeatherPoint[];
  riskLevel: RiskLevel;
  evaluation: RouteEvaluation;
  recommended: boolean;
};

type RouteGeometry = Pick<Route, "distanceMeters" | "durationSeconds" | "encodedPolyline"> & {
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
    response = await fetch(`${API_BASE_URL}/api/get_routes`, {
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

/** Routes come back ranked best first, so the first route is the recommended one when any is. */
export async function requestRoutes(request: RouteRequest): Promise<Route[]> {
  const routes = await requestRouteGeometries(request);
  const weather = await fetchRouteWeather(
    routes.map(({ weatherPoints, durationSeconds }) => ({
      points: weatherPoints,
      durationSeconds,
    })),
    request.departureTime,
    request.loadWeightLbs,
  );
  return rankRoutes(
    routes.map((route, routeIndex) => {
      const forecastRoute = {
        ...route,
        weatherPoints: route.weatherPoints.map((point, pointIndex) => ({
          ...point,
          weather: weather[routeIndex][pointIndex],
        })),
      };
      return {
        ...forecastRoute,
        riskLevel: worstRisk(forecastRoute.weatherPoints.map(({ weather }) => weather.risk.level)),
        evaluation: evaluateRoute(forecastRoute),
      };
    }),
  );
}
