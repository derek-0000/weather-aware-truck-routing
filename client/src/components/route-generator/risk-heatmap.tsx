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

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const PALETTE = (() => {
  const stops = RISK_LEVELS.map((_, level) => hexToRgb(RISK_LEVELS[Math.max(level, 1)].color));
  const palette = new Uint8ClampedArray(256 * 4);
  for (let value = 0; value < 256; value++) {
    const position = (value / 255) * MAX_RISK_LEVEL;
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, MAX_RISK_LEVEL);
    const t = position - lower;
    for (let channel = 0; channel < 3; channel++) {
      palette[value * 4 + channel] =
        stops[lower][channel] + (stops[upper][channel] - stops[lower][channel]) * t;
    }
    palette[value * 4 + 3] =
      (HEAT_OPACITY[lower] + (HEAT_OPACITY[upper] - HEAT_OPACITY[lower]) * t) * 255;
  }
  return palette;
})();

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

function drawHeat(context: CanvasRenderingContext2D, circles: Circle[], width: number, height: number) {
  const hot = circles.filter(({ level }) => level > 0);
  if (hot.length === 0) return false;
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "lighten";
  for (const { x, y, r, level } of hot) {
    const value = Math.round((level / MAX_RISK_LEVEL) * 255);
    const intensity = `rgb(${value}, ${value}, ${value})`;
    const gradient = context.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, intensity);
    gradient.addColorStop(HEAT_CORE, intensity);
    gradient.addColorStop(1, "#000");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalCompositeOperation = "source-over";
  const image = context.getImageData(0, 0, width, height);
  const { data } = image;
  for (let index = 0; index < data.length; index += 4) {
    const offset = data[index] * 4;
    data[index] = PALETTE[offset];
    data[index + 1] = PALETTE[offset + 1];
    data[index + 2] = PALETTE[offset + 2];
    data[index + 3] = PALETTE[offset + 3];
  }
  context.putImageData(image, 0, 0);
  return true;
}

export function RiskHeatmap({ route }: { route: Route }) {
  const map = useMap();
  const geometry = useMapsLibrary("geometry");

  useEffect(() => {
    if (!map || !geometry) return;
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    const heat = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const heatContext = heat.getContext("2d", { willReadFrequently: true });
    if (!context || !heatContext) return;

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
      for (const target of [canvas, heat]) {
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
      if (drawHeat(heatContext, circles, width, height)) context.drawImage(heat, 0, 0);
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
