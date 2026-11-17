export const INITIAL_CENTER = { lat: 28.633, lng: -106.0691 }
export const INITIAL_ZOOM = 6
export const ROUTE_COLORS = ['#2563eb', '#ea580c', '#9333ea']

export const WEATHER_CHECKS = [
  { value: 'lax', label: 'Lax', sampleMiles: 10 },
  { value: 'normal', label: 'Normal', sampleMiles: 25 },
  { value: 'strict', label: 'Strict', sampleMiles: 50 },
] as const

export type WeatherCheck = (typeof WEATHER_CHECKS)[number]['value']
