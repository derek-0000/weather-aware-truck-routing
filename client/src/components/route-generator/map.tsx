import {
  APILoadingStatus,
  ControlPosition,
  Map,
  MapControl,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { Route } from "@/lib/routes";
import { INITIAL_CENTER, INITIAL_ZOOM, ROUTE_COLORS } from "./constants";
import { useRouteGenerator } from "./context";

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

function RoutePolylines({ routes }: { routes: Route[] }) {
  const map = useMap();
  const geometry = useMapsLibrary("geometry");

  useEffect(() => {
    if (!map || !geometry || routes.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    const polylines = routes.map((route, index) => {
      const path = geometry.encoding.decodePath(route.encodedPolyline);
      path.forEach((point) => bounds.extend(point));
      return new google.maps.Polyline({
        map,
        path,
        strokeColor: ROUTE_COLORS[index % ROUTE_COLORS.length],
        strokeOpacity: 0.85,
        strokeWeight: index === 0 ? 6 : 4,
        zIndex: routes.length - index,
      });
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
    return () => polylines.forEach((polyline) => polyline.setMap(null));
  }, [map, geometry, routes]);
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

function WeatherPointDots({ routes }: { routes: Route[] }) {
  const map = useMap();

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
      return route.weatherPoints.map(
        (point, pointIndex) =>
          new google.maps.Marker({
            map,
            position: { lat: point.latitude, lng: point.longitude },
            icon,
            optimized: true,
            clickable: false,
            title: `Route ${routeIndex + 1}, weather point ${pointIndex + 1}`,
            zIndex: routes.length - routeIndex,
          }),
      );
    });
    return () => markers.forEach((marker) => marker.setMap(null));
  }, [map, routes]);

  return null;
}

function MapContent() {
  const { routes, mapsConfigured } = useRouteGenerator();
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
      <RoutePolylines routes={routes} />
      <WeatherPointDots routes={routes} />
      <MapControl position={ControlPosition.TOP_RIGHT}>
        <ResetView />
      </MapControl>
    </Map>
  );
}

export function RouteGeneratorMap() {
  const { routes } = useRouteGenerator();

  if (routes.length > 0) {
    return (
      <div className="h-100 overflow-hidden rounded-xl">
        <MapContent />
      </div>
    );
  }
}
