import { useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  InfoIcon,
  SearchIcon,
} from "lucide-react";
import { cn } from "cn";
import {
  Fragment,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AddressSelect } from "@/components/address-select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ROUTE_COLORS, WEATHER_CHECKS, type WeatherCheck } from "./constants";
import { useRouteGenerator } from "./context";

export function RouteGeneratorForm() {
  const places = useMapsLibrary("places");
  const { form, dispatch, submit, canSubmit, mutation, routes } =
    useRouteGenerator();
  const addressesSelected = Boolean(form.origin && form.destination);

  function onOriginSelect(location: google.maps.places.Place | null) {
    dispatch({ type: "originChanged", location });
  }

  function onDestinationSelect(location: google.maps.places.Place | null) {
    dispatch({ type: "destinationChanged", location });
  }

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) submit();
      }}
    >
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_auto_1fr] mb-2">
        <AddressSelect
          label="Origin"
          places={places}
          onSelect={onOriginSelect}
        />
        <div
          className="flex items-center justify-center text-muted-foreground md:mt-7 md:h-8"
          aria-hidden="true"
        >
          <ArrowRightIcon className="size-4 rotate-90 md:rotate-0" />
        </div>
        <AddressSelect
          label="Destination"
          places={places}
          onSelect={onDestinationSelect}
        />
      </div>
      <div
        data-open={addressesSelected}
        inert={!addressesSelected}
        className="group/reveal grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-snappy data-[open=true]:grid-rows-[1fr] data-[open=true]:duration-500 motion-reduce:transition-none"
      >
        <div className="-mx-1 min-h-0 overflow-hidden px-1 pb-1">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-5">
              <Reveal delay={60}>
                <DepartureField />
              </Reveal>
              <Reveal delay={110}>
                <LoadWeightField />
              </Reveal>
            </div>
            <Reveal delay={150}>
              <WeatherCheckField />
            </Reveal>
          </div>
          <Reveal delay={220} className="mt-2 flex justify-end">
            <Button type="submit" disabled={!canSubmit}>
              <SearchIcon data-icon="inline-start" />
              {mutation.isPending ? "Finding routes…" : "Find Routes"}
            </Button>
          </Reveal>
          {(mutation.isPending || mutation.isError || mutation.isSuccess) && (
            <div className="mt-4 space-y-3">
              {mutation.isPending && (
                <p role="status" className="text-sm text-muted-foreground">
                  Finding route options…
                </p>
              )}
              {mutation.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {mutation.error.message}
                </p>
              )}
              {mutation.isSuccess && routes.length === 0 && (
                <p role="status" className="text-sm text-muted-foreground">
                  No routes found between these addresses. Try another origin or
                  destination.
                </p>
              )}
              {routes.length > 0 && (
                <ul
                  className="flex flex-wrap gap-4 text-sm"
                  aria-label="Route options"
                >
                  {routes.map((route, index) => (
                    <li
                      key={`${index}-${route.encodedPolyline}`}
                      className="flex items-center gap-2"
                    >
                      <span
                        className="size-3 rounded-full"
                        style={{
                          backgroundColor:
                            ROUTE_COLORS[index % ROUTE_COLORS.length],
                        }}
                        aria-hidden="true"
                      />
                      <span>
                        Route {index + 1}:{" "}
                        {(route.distanceMeters / 1000).toLocaleString(
                          undefined,
                          { maximumFractionDigits: 1 },
                        )}{" "}
                        km · {Math.ceil(route.durationSeconds / 60)} min
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

function Reveal({
  delay,
  className,
  children,
}: {
  delay: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
      className={cn(
        "translate-y-2 opacity-0 blur-[3px] transition-[opacity,translate,filter] duration-150 ease-snappy motion-reduce:transition-none",
        "group-data-[open=true]/reveal:translate-y-0 group-data-[open=true]/reveal:opacity-100 group-data-[open=true]/reveal:blur-none",
        "group-data-[open=true]/reveal:delay-(--reveal-delay) group-data-[open=true]/reveal:duration-500",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DepartureField() {
  const { departureDate, departureTime, dispatch } = useRouteGenerator();
  const [open, setOpen] = useState(false);
  const dateId = useId();
  const timeId = useId();

  return (
    <div className="flex gap-3">
      <Field className="w-auto">
        <FieldLabel htmlFor={dateId}>Departure date</FieldLabel>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                id={dateId}
                className="w-36 justify-between font-normal"
              />
            }
          >
            {departureDate
              ? departureDate.toLocaleDateString(undefined, {
                  dateStyle: "medium",
                })
              : "Select date"}
            <ChevronDownIcon data-icon="inline-end" />
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={departureDate}
              captionLayout="dropdown"
              defaultMonth={departureDate}
              onSelect={(date) => {
                dispatch({ type: "departureDateChanged", date });
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </Field>
      <Field className="w-32">
        <FieldLabel htmlFor={timeId}>Time</FieldLabel>
        <Input
          type="time"
          id={timeId}
          value={departureTime}
          onChange={(event) =>
            dispatch({ type: "departureTimeChanged", time: event.target.value })
          }
          className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        />
      </Field>
    </div>
  );
}

function LoadWeightField() {
  const { loadWeightLbs, dispatch } = useRouteGenerator();
  const id = useId();

  return (
    <Field className="w-36">
      <FieldLabel htmlFor={id}>Load weight</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          placeholder="40000"
          value={loadWeightLbs}
          onChange={(event) =>
            dispatch({
              type: "loadWeightChanged",
              loadWeightLbs: event.target.value,
            })
          }
          className="tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>lb</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

function WeatherCheckField() {
  const { weatherCheck, dispatch } = useRouteGenerator();
  const labelId = useId();

  return (
    <Field className="w-auto" aria-labelledby={labelId}>
      <div className="flex items-center gap-1.5">
        <FieldTitle id={labelId}>Weather check</FieldTitle>
        <Popover>
          <PopoverTrigger
            openOnHover
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label="About weather check levels"
              />
            }
          >
            <InfoIcon />
          </PopoverTrigger>
          <PopoverContent side="top" className="w-60">
            <PopoverHeader>
              <PopoverTitle>Weather check</PopoverTitle>
              <PopoverDescription>
                How often weather is sampled along each route.
              </PopoverDescription>
            </PopoverHeader>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 border-t pt-2.5">
              {WEATHER_CHECKS.map(({ value, label, sampleMiles }) => (
                <Fragment key={value}>
                  <dt className="font-medium">{label}</dt>
                  <dd className="text-right text-muted-foreground tabular-nums">
                    every {sampleMiles} mi
                  </dd>
                </Fragment>
              ))}
            </dl>
          </PopoverContent>
        </Popover>
      </div>
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[weatherCheck]}
        onValueChange={(values) => {
          const next = values[0] as WeatherCheck | undefined;
          if (next)
            dispatch({ type: "weatherCheckChanged", weatherCheck: next });
        }}
      >
        {WEATHER_CHECKS.map(({ value, label }) => (
          <ToggleGroupItem key={value} value={value} className="px-3">
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}
