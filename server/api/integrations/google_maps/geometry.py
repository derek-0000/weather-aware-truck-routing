"""Decode Google E5 polylines and sample distances along their paths."""

import math

from .validators import Coordinates, WeatherCheck

EARTH_RADIUS_METERS = 6_371_008.8


def decode_polyline(encoded: str) -> list[Coordinates]:
    points: list[Coordinates] = []
    index = 0
    latitude = longitude = 0

    def read_delta() -> int:
        nonlocal index
        value = shift = 0
        while True:
            if index >= len(encoded) or shift >= 30:
                raise ValueError("Invalid encoded polyline.")
            chunk = ord(encoded[index]) - 63
            index += 1
            if not 0 <= chunk <= 63:
                raise ValueError("Invalid encoded polyline.")
            value |= (chunk & 31) << shift
            if chunk < 32:
                return ~(value >> 1) if value & 1 else value >> 1
            shift += 5

    while index < len(encoded):
        latitude += read_delta()
        longitude += read_delta()
        if not -9_000_000 <= latitude <= 9_000_000 or not -18_000_000 <= longitude <= 18_000_000:
            raise ValueError("Invalid polyline coordinates.")
        points.append(Coordinates(latitude / 100_000, longitude / 100_000))
    if not points:
        raise ValueError("Empty encoded polyline.")
    return points


def haversine_meters(start: Coordinates, end: Coordinates) -> float:
    latitude_start = math.radians(start.latitude)
    latitude_end = math.radians(end.latitude)
    delta_latitude = latitude_end - latitude_start
    delta_longitude = math.radians(end.longitude - start.longitude)
    a = (
        math.sin(delta_latitude / 2) ** 2
        + math.cos(latitude_start) * math.cos(latitude_end)
        * math.sin(delta_longitude / 2) ** 2
    )
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def _interpolate(start: Coordinates, end: Coordinates, distance_meters: float) -> Coordinates:
    """Travel along the segment's great circle by the requested distance."""
    latitude = math.radians(start.latitude)
    longitude = math.radians(start.longitude)
    end_latitude = math.radians(end.latitude)
    delta_longitude = math.radians(end.longitude - start.longitude)
    bearing = math.atan2(
        math.sin(delta_longitude) * math.cos(end_latitude),
        math.cos(latitude) * math.sin(end_latitude)
        - math.sin(latitude) * math.cos(end_latitude) * math.cos(delta_longitude),
    )
    angle = distance_meters / EARTH_RADIUS_METERS
    sin_latitude = (
        math.sin(latitude) * math.cos(angle)
        + math.cos(latitude) * math.sin(angle) * math.cos(bearing)
    )
    result_latitude = math.asin(max(-1.0, min(1.0, sin_latitude)))
    result_longitude = longitude + math.atan2(
        math.sin(bearing) * math.sin(angle) * math.cos(latitude),
        math.cos(angle) - math.sin(latitude) * math.sin(result_latitude),
    )
    return Coordinates(
        math.degrees(result_latitude),
        (math.degrees(result_longitude) + 180) % 360 - 180,
    )


def collect_weather_points(encoded: str, weather_check: WeatherCheck) -> list[Coordinates]:
    points = decode_polyline(encoded)
    samples = [points[0]]
    interval = weather_check.interval_meters
    traveled = last_sample_distance = 0.0
    next_sample = interval
    for start, end in zip(points, points[1:]):
        segment_distance = haversine_meters(start, end)
        segment_end = traveled + segment_distance
        # A loop preserves every interval even when a segment spans several.
        while segment_distance > 0 and next_sample < segment_end:
            samples.append(_interpolate(start, end, next_sample - traveled))
            last_sample_distance = next_sample
            next_sample = len(samples) * interval
        traveled = segment_end
    # Merge an interval landing on the destination rather than duplicating it.
    if math.isclose(last_sample_distance, traveled, rel_tol=0, abs_tol=1e-6):
        samples[-1] = points[-1]
    else:
        samples.append(points[-1])
    return samples
