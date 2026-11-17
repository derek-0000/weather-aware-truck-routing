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
