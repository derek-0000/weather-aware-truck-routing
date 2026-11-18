import { useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  InfoIcon,
  SearchIcon,
} from "lucide-react";
import { cn } from "cn";
import { addHours } from "date-fns";
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
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MAX_DEPARTURE_DELAY_HOURS,
  WEATHER_CHECKS,
  type WeatherCheck,
} from "./constants";
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
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
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
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-4">
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
            <Reveal delay={190}>
              <DepartureDelayField />
            </Reveal>
            <Reveal delay={220} className="flex justify-end">
              <Button type="submit" disabled={!canSubmit}>
                <SearchIcon data-icon="inline-start" />
                {mutation.isPending ? "Finding routes…" : "Find Routes"}
              </Button>
            </Reveal>
            {/* The map's loader shows progress visually; this announces it. */}
            <p role="status" className="sr-only">
              {mutation.isPending ? "Finding route options…" : ""}
            </p>
            {(mutation.isError ||
              (mutation.isSuccess && routes.length === 0)) && (
              <div className="space-y-3">
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
              </div>
            )}
          </div>
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

const DEPARTURE_TICK_HOURS = [0, 12, 24, 36, 48] as const;

function formatDepartureSlot(date: Date) {
  return date.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DepartureDelayField() {
  const { departureDelayHours, scheduledDeparture, dispatch } =
    useRouteGenerator();
  const labelId = useId();
  const delayedDeparture =
    scheduledDeparture && addHours(scheduledDeparture, departureDelayHours);
  const delayLabel =
    departureDelayHours === 0 ? "On time" : `+${departureDelayHours} h`;

  return (
    <Field aria-labelledby={labelId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <FieldTitle id={labelId}>Delay departure</FieldTitle>
        <span className="text-sm text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{delayLabel}</span>
          {delayedDeparture && <> · {formatDepartureSlot(delayedDeparture)}</>}
        </span>
      </div>
      <div className="py-1">
        <Slider
          aria-labelledby={labelId}
          min={0}
          max={MAX_DEPARTURE_DELAY_HOURS}
          step={1}
          value={[departureDelayHours]}
          disabled={!scheduledDeparture}
          onValueChange={(value) => {
            const hours = Array.isArray(value) ? value[0] : value;
            dispatch({ type: "departureDelayChanged", hours });
          }}
        />
      </div>
      <div
        aria-hidden="true"
        className="flex justify-between text-xs text-muted-foreground tabular-nums"
      >
        {DEPARTURE_TICK_HOURS.map((hours) => (
          <span key={hours}>
            {hours === 0 ? "Departure" : `+${hours} h`}
          </span>
        ))}
      </div>
    </Field>
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
          required
          min={1}
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
