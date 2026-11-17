import type { RouteRequest } from '@/lib/routes'
import type { WeatherCheck } from './constants'

export type RouteGeneratorState = {
  form: { [Field in keyof Pick<RouteRequest, 'origin' | 'destination'>]: RouteRequest[Field] | null }
  departureDate: Date | undefined
  departureTime: string
  loadWeightLbs: string
  weatherCheck: WeatherCheck
}

export type RouteGeneratorAction =
  | { type: 'originChanged'; location: RouteRequest['origin'] | null }
  | { type: 'destinationChanged'; location: RouteRequest['destination'] | null }
  | { type: 'departureDateChanged'; date: Date | undefined }
  | { type: 'departureTimeChanged'; time: string }
  | { type: 'loadWeightChanged'; loadWeightLbs: string }
  | { type: 'weatherCheckChanged'; weatherCheck: WeatherCheck }

export function createInitialRouteGeneratorState(): RouteGeneratorState {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    form: { origin: null, destination: null },
    departureDate: now,
    departureTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    loadWeightLbs: '',
    weatherCheck: 'lax',
  }
}

export function routeGeneratorReducer(
  state: RouteGeneratorState,
  action: RouteGeneratorAction,
): RouteGeneratorState {
  switch (action.type) {
    case 'originChanged':
      return {
        ...state,
        form: { ...state.form, origin: action.location },
      }
    case 'destinationChanged':
      return {
        ...state,
        form: { ...state.form, destination: action.location },
      }
    case 'departureDateChanged':
      return { ...state, departureDate: action.date }
    case 'departureTimeChanged':
      return { ...state, departureTime: action.time }
    case 'loadWeightChanged':
      return { ...state, loadWeightLbs: action.loadWeightLbs }
    case 'weatherCheckChanged':
      return { ...state, weatherCheck: action.weatherCheck }
    default: {
      const exhaustive: never = action
      throw new Error(`Unhandled route generator action: ${exhaustive}`)
    }
  }
}
