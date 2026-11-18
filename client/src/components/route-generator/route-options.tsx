import { CheckIcon } from "lucide-react";
import { ROUTE_COLORS } from "./constants";
import { useRouteGenerator } from "./context";
import { RiskBadge } from "./risk-badge";

function formatDuration(seconds: number) {
  const totalMinutes = Math.ceil(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function RouteOptions() {
  const { routes, selectedRouteIndex, selectRoute } = useRouteGenerator();

  return (
    <ul
      className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3"
      aria-label="Route options"
    >
      {routes.map((route, index) => (
        <li key={`${index}-${route.encodedPolyline}`}>
          <button
            type="button"
            aria-pressed={index === selectedRouteIndex}
            onClick={() => selectRoute(index)}
            className="flex size-full flex-col items-start gap-1.5 rounded-lg border border-border px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted/60 aria-pressed:border-foreground/30 aria-pressed:bg-muted aria-pressed:text-foreground"
          >
            <span className="flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{
                  backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length],
                }}
                aria-hidden="true"
              />
              <span>
                Route {index + 1}:{" "}
                {(route.distanceMeters / 1000).toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}{" "}
                km · {formatDuration(route.durationSeconds)}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Risk Level:</span>
              <RiskBadge
                level={route.riskLevel}
                className="bg-transparent px-0"
              />
              {route.recommended && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  <CheckIcon aria-hidden className="size-3" />
                  Recommended
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
