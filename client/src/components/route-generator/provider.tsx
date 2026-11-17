import { useMutation } from '@tanstack/react-query'
import { APIProvider } from '@vis.gl/react-google-maps'
import { useReducer, type ReactNode } from 'react'
import { requestRoutes, type Route } from '@/lib/routes'
import { RouteGeneratorStateContext, type RouteGeneratorContextValue } from './context'
import { createInitialRouteGeneratorState, routeGeneratorReducer, type RouteGeneratorAction } from './reducer'

const EMPTY_ROUTES: Route[] = []

export function RouteGeneratorContext({ children }: { children: ReactNode }) {
  const [state, reducerDispatch] = useReducer(routeGeneratorReducer, undefined, createInitialRouteGeneratorState)
  const mutation = useMutation({ mutationFn: requestRoutes, retry: false })
  const { mutate, reset, isPending } = mutation
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()

  function dispatch(action: RouteGeneratorAction) {
    reset()
    reducerDispatch(action)
  }

  function submit() {
    const { origin, destination } = state.form
    if (origin && destination && !isPending) mutate({ origin, destination })
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
    canSubmit: Boolean(apiKey && state.form.origin && state.form.destination && !isPending),
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
