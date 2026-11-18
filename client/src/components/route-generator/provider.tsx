import { useMutation } from '@tanstack/react-query'
import { addHours } from 'date-fns'
import { APIProvider } from '@vis.gl/react-google-maps'
import { useReducer, useState, type ReactNode } from 'react'
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

function parseLoadWeight(value: string): number | null {
  if (!value.trim()) return null
  const pounds = Number(value)
  return Number.isFinite(pounds) && pounds > 0 ? pounds : null
}

export function RouteGeneratorContext({ children }: { children: ReactNode }) {
  const [state, reducerDispatch] = useReducer(routeGeneratorReducer, undefined, createInitialRouteGeneratorState)
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)
  const [previousRoutes, setPreviousRoutes] = useState<Route[]>(EMPTY_ROUTES)
  const mutation = useMutation({
    mutationFn: requestRoutes,
    retry: false,
    onSuccess: (routes) => {
      setPreviousRoutes(routes)
      setSelectedRouteIndex(0)
    },
    onError: () => setPreviousRoutes(EMPTY_ROUTES),
  })
  const { mutate, reset, isPending, isError } = mutation
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
  const scheduledDeparture = parseDepartureTime(state.departureDate, state.departureTime)
  const departureTime = scheduledDeparture && addHours(scheduledDeparture, state.departureDelayHours)
  const loadWeightLbs = parseLoadWeight(state.loadWeightLbs)

  function dispatch(action: RouteGeneratorAction) {
    if (isError) reset()
    reducerDispatch(action)
  }

  function submit() {
    const { origin, destination } = state.form
    if (origin && destination && departureTime && loadWeightLbs !== null && !isPending) {
      mutate({
        origin,
        destination,
        weatherCheck: state.weatherCheck,
        departureTime,
        loadWeightLbs,
      })
    }
  }

  const value: RouteGeneratorContextValue = {
    form: state.form,
    departureDate: state.departureDate,
    departureTime: state.departureTime,
    departureDelayHours: state.departureDelayHours,
    scheduledDeparture,
    loadWeightLbs: state.loadWeightLbs,
    weatherCheck: state.weatherCheck,
    dispatch,
    mutation,
    routes: isPending ? previousRoutes : (mutation.data ?? EMPTY_ROUTES),
    selectedRouteIndex,
    selectRoute: setSelectedRouteIndex,
    canSubmit: Boolean(
      apiKey && state.form.origin && state.form.destination && departureTime && loadWeightLbs !== null && !isPending,
    ),
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
