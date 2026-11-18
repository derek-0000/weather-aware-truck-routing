import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { MAX_RISK_LEVEL, RISK_LEVELS, type RiskLevel } from "@/lib/risk";
import type { Route } from "@/lib/routes";

const MIN_RADIUS_METERS = 1_500;
const MAX_RADIUS_METERS = 40_000;
const RADIUS_SPACING_RATIO = 0.6;
const HEAT_OPACITY = [0, 0.3, 0.42, 0.54, 0.66] as const;
const HEAT_CORE = 0.35;

type Spot = { position: google.maps.LatLng; radius: number; level: RiskLevel };
type Circle = { x: number; y: number; r: number; level: RiskLevel };
type Surface = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D };

function createSurface(): Surface | null {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  return context && { canvas, context };
}

function createSpots(route: Route, spherical: google.maps.GeometryLibrary["spherical"]): Spot[] {
  const positions = route.weatherPoints.map(
    ({ latitude, longitude }) => new google.maps.LatLng(latitude, longitude),
  );
  return positions.map((position, index) => {
    const gaps = [positions[index - 1], positions[index + 1]]
      .filter((neighbor) => neighbor !== undefined)
      .map((neighbor) => spherical.computeDistanceBetween(position, neighbor));
    const spacing = gaps.length
      ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
      : MAX_RADIUS_METERS / RADIUS_SPACING_RATIO;
    return {
      position,
      radius: Math.min(Math.max(spacing * RADIUS_SPACING_RATIO, MIN_RADIUS_METERS), MAX_RADIUS_METERS),
      level: route.weatherPoints[index].weather.risk.level,
    };
  });
}

function drawSpots(context: CanvasRenderingContext2D, circles: Circle[], color: string) {
  const fade = `${color}00`;
  for (const { x, y, r } of circles) {
    const gradient = context.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(HEAT_CORE, color);
    gradient.addColorStop(1, fade);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * Each level is drawn opaque on its own layer so overlapping spots merge evenly,
 * then composited at its heat opacity. Levels run highest first, and every layer
 * is erased wherever a higher level already covers, so higher severities win.
 */
function drawHeat(
  target: CanvasRenderingContext2D,
  layer: Surface,
  coverage: Surface,
  circles: Circle[],
  width: number,
  height: number,
) {
  coverage.context.clearRect(0, 0, width, height);
  for (let level = MAX_RISK_LEVEL; level > 0; level--) {
    const spots = circles.filter((circle) => circle.level === level);
    if (spots.length === 0) continue;
    layer.context.clearRect(0, 0, width, height);
    layer.context.globalCompositeOperation = "source-over";
    drawSpots(layer.context, spots, RISK_LEVELS[level].color);
    layer.context.globalCompositeOperation = "destination-out";
    layer.context.drawImage(coverage.canvas, 0, 0);
    target.globalAlpha = HEAT_OPACITY[level];
    target.drawImage(layer.canvas, 0, 0);
    coverage.context.drawImage(layer.canvas, 0, 0);
  }
  target.globalAlpha = 1;
}

export function RiskHeatmap({ route }: { route: Route }) {
  const map = useMap();
  const geometry = useMapsLibrary("geometry");

  useEffect(() => {
    if (!map || !geometry) return;
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    const context = canvas.getContext("2d");
    const layer = createSurface();
    const coverage = createSurface();
    if (!context || !layer || !coverage) return;

    const { spherical } = geometry;
    const spots = createSpots(route, spherical);
    const overlay = new google.maps.OverlayView();
    let frame = 0;

    const render = () => {
      frame = 0;
      const projection = overlay.getProjection();
      if (!projection || !map) return;
      const mapDiv = map.getDiv();
      const width = mapDiv.clientWidth;
      const height = mapDiv.clientHeight;
      const topLeft = projection.fromContainerPixelToLatLng(new google.maps.Point(0, 0));
      const offset = topLeft && projection.fromLatLngToDivPixel(topLeft);
      if (!offset || width === 0 || height === 0) return;

      canvas.style.left = `${offset.x}px`;
      canvas.style.top = `${offset.y}px`;
      for (const target of [canvas, layer.canvas, coverage.canvas]) {
        if (target.width !== width) target.width = width;
        if (target.height !== height) target.height = height;
      }

      const circles = spots.flatMap(({ position, radius, level }): Circle[] => {
        const center = projection.fromLatLngToContainerPixel(position);
        const edge = projection.fromLatLngToContainerPixel(
          spherical.computeOffset(position, radius, 90),
        );
        if (!center || !edge) return [];
        return [{ x: center.x, y: center.y, r: Math.hypot(edge.x - center.x, edge.y - center.y), level }];
      });

      context.clearRect(0, 0, width, height);
      drawHeat(context, layer, coverage, circles, width, height);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    overlay.onAdd = () => overlay.getPanes()?.mapPane.appendChild(canvas);
    overlay.onRemove = () => canvas.remove();
    overlay.draw = () => {
      cancelAnimationFrame(frame);
      render();
    };
    overlay.setMap(map);
    const boundsListener = map.addListener("bounds_changed", schedule);

    return () => {
      cancelAnimationFrame(frame);
      boundsListener.remove();
      overlay.setMap(null);
    };
  }, [map, geometry, route]);

  return null;
}
