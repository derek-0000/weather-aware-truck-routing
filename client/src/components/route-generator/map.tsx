import {
  APILoadingStatus,
  ControlPosition,
  Map,
  MapControl,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { format } from "date-fns";
import {
  ClockIcon,
  CloudRainIcon,
  SearchIcon,
  SnowflakeIcon,
  WindIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import type { Route } from "@/lib/routes";
import { INITIAL_CENTER, INITIAL_ZOOM, ROUTE_COLORS } from "./constants";
import { useRouteGenerator } from "./context";
import { PixelGridLoader } from "./pixel-grid-loader";
import { RiskBadge } from "./risk-badge";
import { RiskHeatmap } from "./risk-heatmap";
import { RouteOptions } from "./route-options";

function ResetView() {
  const map = useMap();
  return (
    <Button
      className="m-3 shadow-sm"
      variant="outline"
      onClick={() => {
        map?.setCenter(INITIAL_CENTER);
        map?.setZoom(INITIAL_ZOOM);
      }}
    >
      Reset view
    </Button>
  );
}

function RoutePolylines({
  routes,
  selectedIndex,
  onSelect,
  onFitted,
}: {
  routes: Route[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onFitted: () => void;
}) {
  const map = useMap();
  const geometry = useMapsLibrary("geometry");
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const onFittedRef = useRef(onFitted);
  useEffect(() => {
    onFittedRef.current = onFitted;
  });

  useEffect(() => {
    if (!map || !geometry || routes.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    const polylines = routes.map((route, index) => {
      const path = geometry.encoding.decodePath(route.encodedPolyline);
      path.forEach((point) => bounds.extend(point));
      const polyline = new google.maps.Polyline({
        map,
        path,
        strokeColor: ROUTE_COLORS[index % ROUTE_COLORS.length],
        clickable: true,
      });
      polyline.addListener("click", () => onSelect(index));
      return polyline;
    });
    polylinesRef.current = polylines;
    const idle = google.maps.event.addListenerOnce(map, "idle", () =>
      onFittedRef.current(),
    );
    if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
    return () => {
      idle.remove();
      polylinesRef.current = [];
      polylines.forEach((polyline) => {
        google.maps.event.clearInstanceListeners(polyline);
        polyline.setMap(null);
      });
    };
  }, [map, geometry, routes, onSelect]);

  // Restyle without recreating the polylines, so selecting a route keeps the current view.
  useEffect(() => {
    polylinesRef.current.forEach((polyline, index) => {
      const selected = index === selectedIndex;
      polyline.setOptions({
        strokeOpacity: selected ? 0.95 : 0.45,
        strokeWeight: selected ? 6 : 4,
        zIndex: selected ? routes.length + 1 : routes.length - index,
      });
    });
  }, [map, geometry, routes, selectedIndex]);
  return null;
}

function createWeatherPointIcon(color: string): google.maps.Icon {
  const size = 14;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to draw weather point icons.");
  context.scale(2, 2);
  context.beginPath();
  context.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.stroke();
  return {
    url: canvas.toDataURL("image/png"),
    size: new google.maps.Size(canvas.width, canvas.height),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

type WeatherPoint = Route["weatherPoints"][number];
type PointSelection = { routes: Route[]; routeIndex: number; pointIndex: number };

const POPOVER_EDGE_PADDING = 8;
const POPOVER_POINT_GAP = 12;

function MapPopover({
  position,
  children,
}: {
  position: google.maps.LatLngLiteral;
  children: ReactNode;
}) {
  const map = useMap();
  const [container] = useState(() => {
    const element = document.createElement("div");
    element.style.position = "absolute";
    element.style.visibility = "hidden";
    return element;
  });
  const { lat, lng } = position;

  useEffect(() => {
    if (!map) return;
    google.maps.OverlayView.preventMapHitsAndGesturesFrom(container);
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => overlay.getPanes()?.floatPane.appendChild(container);
    overlay.onRemove = () => container.remove();
    overlay.draw = () => {
      const projection = overlay.getProjection();
      const anchor = projection.fromLatLngToDivPixel({ lat, lng });
      const viewport = projection.fromLatLngToContainerPixel({ lat, lng });
      if (!anchor || !viewport) return;
      container.style.left = `${anchor.x}px`;
      container.style.top = `${anchor.y}px`;

      const card = container.firstElementChild;
      if (!(card instanceof HTMLElement)) return;
      const mapDiv = map.getDiv();
      const half = card.offsetWidth / 2;
      const minX = POPOVER_EDGE_PADDING + half;
      const maxX = mapDiv.clientWidth - POPOVER_EDGE_PADDING - half;
      const shift = Math.min(Math.max(viewport.x, minX), Math.max(minX, maxX)) - viewport.x;
      const below =
        viewport.y - card.offsetHeight - POPOVER_POINT_GAP < POPOVER_EDGE_PADDING;
      card.style.transform = `translate(calc(-50% + ${shift}px), ${
        below ? `${POPOVER_POINT_GAP}px` : `calc(-100% - ${POPOVER_POINT_GAP}px)`
      })`;
      container.style.visibility = "visible";
    };
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, container, lat, lng]);

  return createPortal(children, container);
}

const etaFormat = "EEE, MMM d · h:mm a";

function formatRate(value: number) {
  return value === 0 ? "None" : `${value < 0.01 ? "<0.01" : value.toFixed(2)} in/h`;
}

function WeatherPointCard({
  point,
  routeIndex,
  pointIndex,
  pointCount,
  color,
}: {
  point: WeatherPoint;
  routeIndex: number;
  pointIndex: number;
  pointCount: number;
  color: string;
}) {
  const { eta, forecastTime, windMph, rainInph, snowInph, risk } =
    point.weather;
  const label =
    pointIndex === 0
      ? "Start"
      : pointIndex === pointCount - 1
        ? "Destination"
        : `Checkpoint ${pointIndex} of ${pointCount - 2}`;
  const rows = [
    {
      icon: WindIcon,
      label: "Wind",
      value: `${windMph.toFixed(1)} mph`,
      level: risk.wind,
    },
    {
      icon: CloudRainIcon,
      label: "Rain",
      value: formatRate(rainInph),
      level: risk.rain,
    },
    {
      icon: SnowflakeIcon,
      label: "Snow",
      value: formatRate(snowInph),
      level: risk.snow,
    },
  ];

  return (
    <div
      role="tooltip"
      className="absolute left-0 w-72 rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <p className="font-medium">
          {label}
          <span className="font-normal text-muted-foreground">
            {" "}
            · Route {routeIndex + 1}
          </span>
        </p>
        <RiskBadge level={risk.level} className="ml-auto" />
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ClockIcon aria-hidden className="size-3.5" />
        <span>
          ETA <time dateTime={eta}>{format(new Date(eta), etaFormat)}</time>
        </span>
      </p>
      <dl className="mt-3 space-y-1.5">
        {rows.map(({ icon: Icon, label, value, level }) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <Icon aria-hidden className="size-4" />
              {label}
            </dt>
            <dd className="flex items-center gap-2">
              <span className="font-medium tabular-nums">{value}</span>
              <RiskBadge level={level} />
            </dd>
          </div>
        ))}
      </dl>
      {risk.windLoadAdjusted && (
        <p className="mt-2 text-xs text-muted-foreground">
          Wind level raised for this load weight.
        </p>
      )}
      <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
        Forecast for{" "}
        <time dateTime={forecastTime}>
          {format(new Date(forecastTime), "h:mm a")}
        </time>
      </p>
    </div>
  );
}

function WeatherPoints({
  routes,
  selectedIndex,
}: {
  routes: Route[];
  selectedIndex: number;
}) {
  const map = useMap();
  const [hovered, setHovered] = useState<PointSelection | null>(null);
  const [pinned, setPinned] = useState<PointSelection | null>(null);
  const pinnedRef = useRef(pinned);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  useEffect(() => {
    if (!map) return;
    const icons = new globalThis.Map<string, google.maps.Icon>();
    const markers = routes.flatMap((route, routeIndex) => {
      const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
      let icon = icons.get(color);
      if (!icon) {
        icon = createWeatherPointIcon(color);
        icons.set(color, icon);
      }
      return route.weatherPoints.map((point, pointIndex) => {
        const marker = new google.maps.Marker({
          map,
          position: { lat: point.latitude, lng: point.longitude },
          icon,
          optimized: true,
          cursor: "pointer",
          zIndex:
            routeIndex === selectedIndex
              ? routes.length + 1
              : routes.length - routeIndex,
        });
        const selection = { routes, routeIndex, pointIndex };
        marker.addListener("mouseover", () => setHovered(selection));
        marker.addListener("mouseout", () => setHovered(null));
        marker.addListener("click", () => {
          const isPinned =
            pinnedRef.current?.routes === routes &&
            pinnedRef.current.routeIndex === routeIndex &&
            pinnedRef.current.pointIndex === pointIndex;
          setPinned(isPinned ? null : selection);
          setHovered(isPinned ? null : selection);
        });
        return marker;
      });
    });
    const close = () => {
      setPinned(null);
      setHovered(null);
    };
    const mapClick = map.addListener("click", close);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      markers.forEach((marker) => {
        google.maps.event.clearInstanceListeners(marker);
        marker.setMap(null);
      });
      mapClick.remove();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [map, routes, selectedIndex]);

  const active = [pinned, hovered].find((selection) => selection?.routes === routes);
  const route = active ? routes[active.routeIndex] : undefined;
  const point = active ? route?.weatherPoints[active.pointIndex] : undefined;
  if (!active || !route || !point) return null;

  return (
    <MapPopover position={{ lat: point.latitude, lng: point.longitude }}>
      <WeatherPointCard
        point={point}
        routeIndex={active.routeIndex}
        pointIndex={active.pointIndex}
        pointCount={route.weatherPoints.length}
        color={ROUTE_COLORS[active.routeIndex % ROUTE_COLORS.length]}
      />
    </MapPopover>
  );
}

function MapContent({ onReady }: { onReady: () => void }) {
  const { routes, selectedRouteIndex, selectRoute, mapsConfigured } =
    useRouteGenerator();
  const selectedRoute = routes[selectedRouteIndex];
  const status = useApiLoadingStatus();
  if (!mapsConfigured) {
    return (
      <div
        className="flex h-full items-center justify-center bg-muted p-6"
        role="status"
      >
        <div className="max-w-sm space-y-2 text-center">
          <h1 className="text-lg font-semibold">Map unavailable</h1>
          <p className="text-sm text-muted-foreground">
            Google Maps has not been configured yet.
          </p>
        </div>
      </div>
    );
  }
  if (
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div
        className="flex h-full items-center justify-center bg-muted p-6"
        role="alert"
      >
        <div className="max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold">Unable to load Google Maps</h1>
          <p className="text-sm text-muted-foreground">
            Please try again later.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (status !== APILoadingStatus.LOADED) {
    return (
      <div
        className="flex h-full items-center justify-center bg-muted"
        role="status"
      >
        <p className="text-sm text-muted-foreground">Loading map…</p>
      </div>
    );
  }
  return (
    <Map
      className="h-full w-full"
      defaultCenter={INITIAL_CENTER}
      defaultZoom={INITIAL_ZOOM}
      colorScheme="DARK"
      gestureHandling="cooperative"
      streetViewControl={false}
      mapTypeControl={false}
      fullscreenControl={false}
    >
      {selectedRoute && <RiskHeatmap route={selectedRoute} />}
      <RoutePolylines
        routes={routes}
        selectedIndex={selectedRouteIndex}
        onSelect={selectRoute}
        onFitted={onReady}
      />
      <WeatherPoints routes={routes} selectedIndex={selectedRouteIndex} />
      <MapControl position={ControlPosition.TOP_RIGHT}>
        <ResetView />
      </MapControl>
    </Map>
  );
}

const MAP_READY_TIMEOUT_MS = 1500;

function EmptyState() {
  return (
    <div className="flex h-120 animate-in flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card text-center duration-300 ease-snappy fade-in-0 zoom-in-[0.98]">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchIcon aria-hidden className="size-5" />
      </span>
      <p className="text-sm text-muted-foreground">
        Query a route to see the map
      </p>
    </div>
  );
}


export function RouteGeneratorMap() {
  const { routes, mutation, mapsConfigured } = useRouteGenerator();
  const [readyRoutes, setReadyRoutes] = useState<Route[] | null>(null);
  const [loaderShown, setLoaderShown] = useState(false);
  const hasRoutes = routes.length > 0;
  const covering =
    mutation.isPending ||
    (hasRoutes && mapsConfigured && readyRoutes !== routes);
  if (covering && !loaderShown) setLoaderShown(true);

  useEffect(() => {
    if (!hasRoutes) return;
    const timeout = setTimeout(
      () => setReadyRoutes(routes),
      MAP_READY_TIMEOUT_MS,
    );
    return () => clearTimeout(timeout);
  }, [hasRoutes, routes]);

  return (
    <section
      aria-label="Route results"
      aria-busy={covering}
      className="relative"
    >
      {hasRoutes ? (
        <div className="flex flex-col gap-4 sm:h-120">
          <RouteOptions />
          <div className="h-100 overflow-hidden rounded-xl sm:h-auto sm:min-h-0 sm:flex-1">
            <MapContent onReady={() => setReadyRoutes(routes)} />
          </div>
        </div>
      ) : (
        <EmptyState />
      )}
      {loaderShown && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <PixelGridLoader
            active={covering}
            onExited={() => setLoaderShown(false)}
          />
        </div>
      )}
    </section>
  );
}
