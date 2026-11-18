"""Budget route weather points against Open-Meteo's free-tier quota."""

from collections.abc import Sequence

from ..google_maps.geometry import decode_polyline, sample_path
from ..google_maps.validators import Coordinates, WeatherCheck

# Open-Meteo's free tier allows 600 calls per minute per IP address.
MAX_WEATHER_POINTS = 600


def collect_weather_points(
    encoded_polylines: Sequence[str], weather_check: WeatherCheck
) -> tuple[WeatherCheck | None, list[list[Coordinates]]]:
    """Sample every route, falling back to sparser checks when there are too many points.

    The client requests one Open-Meteo forecast per point, and every point costs
    one call against the free per-minute limit, so the limit applies to the total
    across all routes. Returns the level actually used with the samples. If even
    `lax` exceeds the limit, the level is None, every route gets no points, and
    the client skips the weather requests.
    """
    paths = [decode_polyline(encoded) for encoded in encoded_polylines]
    for level in weather_check.fallbacks:
        samples = [sample_path(path, level.interval_meters) for path in paths]
        if sum(len(route_samples) for route_samples in samples) <= MAX_WEATHER_POINTS:
            return level, samples
    return None, [[] for _ in paths]
