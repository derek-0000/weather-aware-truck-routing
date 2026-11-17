import { useMutation } from '@tanstack/react-query'
import { APIProvider } from '@vis.gl/react-google-maps'
import { useReducer, type ReactNode } from 'react'
import { requestRoutes, type Route } from '@/lib/routes'
import { RouteGeneratorStateContext, type RouteGeneratorContextValue } from './context'
import { createInitialRouteGeneratorState, routeGeneratorReducer, type RouteGeneratorAction } from './reducer'

const EMPTY_ROUTES: Route[] = []

function parseDepartureTime(date: Date | undefined, time: string): Date | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  if (!date || !match) return null
  const departure = new Date(date)
  departure.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return Number.isFinite(departure.getTime()) ? departure : null
}

export function RouteGeneratorContext({ children }: { children: ReactNode }) {
  const [state, reducerDispatch] = useReducer(routeGeneratorReducer, undefined, createInitialRouteGeneratorState)
  const mutation = useMutation({ mutationFn: requestRoutes, retry: false })
  const { mutate, reset, isPending } = mutation
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
  const departureTime = parseDepartureTime(state.departureDate, state.departureTime)

  function dispatch(action: RouteGeneratorAction) {
    reset()
    reducerDispatch(action)
  }

  function submit() {
    const { origin, destination } = state.form
    if (origin && destination && departureTime && !isPending) {
      mutate({ origin, destination, weatherCheck: state.weatherCheck, departureTime })
    }
  }

  const value: RouteGeneratorContextValue = {
    form: state.form,
    departureDate: state.departureDate,
    departureTime: state.departureTime,
    loadWeightLbs: state.loadWeightLbs,
    weatherCheck: state.weatherCheck,
    dispatch,
    mutation,
    routes: mutation.data ?? EMPTY_ROUTES,
    canSubmit: Boolean(apiKey && state.form.origin && state.form.destination && departureTime && !isPending),
    submit,
    mapsConfigured: Boolean(apiKey),
  }
  const content = (
    <RouteGeneratorStateContext.Provider value={value}>
      {children}
    </RouteGeneratorStateContext.Provider>
  )

  return apiKey ? <APIProvider apiKey={apiKey}>{content}</APIProvider> : content
}
