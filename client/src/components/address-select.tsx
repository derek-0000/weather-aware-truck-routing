import { skipToken, useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'

type Prediction = google.maps.places.PlacePrediction

type AddressSelectProps = {
  label: string
  places: google.maps.PlacesLibrary | null
  onSelect: (location: google.maps.places.Place | null) => void
}

export function AddressSelect({ label, places, onSelect }: AddressSelectProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selected, setSelected] = useState<Prediction | null>(null)
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const input = query.trim()

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(input), 300)
    return () => window.clearTimeout(timer)
  }, [input])

  const canSearch = !selected && input.length >= 3 && input === debouncedQuery
  const search = useQuery({
    queryKey: ['address-predictions', id, debouncedQuery],
    queryFn: places && canSearch ? async () => {
      session.current ??= new places.AutocompleteSessionToken()
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: debouncedQuery,
        sessionToken: session.current,
      })
      return suggestions.flatMap(({ placePrediction }) => placePrediction ? [placePrediction] : [])
    } : skipToken,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 0,
    structuralSharing: false,
  })

  const predictions = canSearch ? search.data ?? [] : []
  const error = canSearch && search.isError
    ? 'Unable to search addresses. Please try again.'
    : null
  const isSearching = !selected && input.length >= 3 && (!canSearch || search.isFetching)
  const emptyMessage = isSearching
    ? 'Searching addresses…'
    : error ?? (input.length < 3 ? 'Type at least 3 characters to search' : 'No addresses found')

  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-center text-sm font-medium">{label}</label>
      <Combobox
        items={predictions}
        filter={null}
        value={selected}
        inputValue={query}
        itemToStringLabel={(prediction: Prediction) => prediction.text.toString()}
        isItemEqualToValue={(a, b) => a.placeId === b.placeId}
        onInputValueChange={(value, details) => {
          setQuery(value)
          if (details.reason === 'input-change' || details.reason === 'input-clear') {
            setSelected(null)
            onSelect(null)
            if (!value.trim()) session.current = null
          }
        }}
        onValueChange={(prediction) => {
          onSelect(prediction?.toPlace() ?? null)
          setSelected(prediction)
          setQuery(prediction?.text.toString() ?? '')
          session.current = null
        }}
        disabled={!places}
      >
        <ComboboxInput id={id} className="w-full" placeholder="Search an address" showClear />
        <ComboboxContent>
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
          <ComboboxList>
            {(prediction: Prediction) => (
              <ComboboxItem key={prediction.placeId} value={prediction}>
                {prediction.text.toString()}
              </ComboboxItem>
            )}
          </ComboboxList>
          <div className="border-t px-3 py-2 text-right text-xs text-muted-foreground">Google Maps</div>
        </ComboboxContent>
      </Combobox>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
