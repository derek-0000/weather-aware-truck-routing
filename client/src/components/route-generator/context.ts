import type { UseMutationResult } from '@tanstack/react-query'
import { createContext, useContext, type Dispatch } from 'react'
import type { Route, RouteRequest } from '@/lib/routes'
import type { RouteGeneratorAction, RouteGeneratorState } from './reducer'

export type RouteGeneratorContextValue = {
  form: RouteGeneratorState['form']
  departureDate: RouteGeneratorState['departureDate']
  departureTime: RouteGeneratorState['departureTime']
  departureDelayHours: RouteGeneratorState['departureDelayHours']
  scheduledDeparture: Date | null
  loadWeightLbs: RouteGeneratorState['loadWeightLbs']
  weatherCheck: RouteGeneratorState['weatherCheck']
  dispatch: Dispatch<RouteGeneratorAction>
  mutation: UseMutationResult<Route[], Error, RouteRequest>
  routes: Route[]
  selectedRouteIndex: number
  selectRoute: (index: number) => void
  canSubmit: boolean
  submit: () => void
  mapsConfigured: boolean
}

export const RouteGeneratorStateContext = createContext<RouteGeneratorContextValue | null>(null)

export function useRouteGenerator() {
  const context = useContext(RouteGeneratorStateContext)
  if (!context) {
    throw new Error('useRouteGenerator must be used inside RouteGeneratorContext.')
  }
  return context
}
