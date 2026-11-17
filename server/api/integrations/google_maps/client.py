from typing import Any, NotRequired, TypedDict

import requests

from .builders import ROUTES_API_URL, build_routes_body, build_routes_headers
from .geometry import collect_weather_points
from .validators import RoutesRequest, WeatherCheck


class RoutePoint(TypedDict):
    latitude: float
    longitude: float


class RoutePolyline(TypedDict):
    encodedPolyline: str


class GoogleRoute(TypedDict):
    distanceMeters: int
    durationSeconds: float
    polyline: RoutePolyline
    weather_points: list[RoutePoint]


class RoutesResponse(TypedDict):
    routes: list[GoogleRoute]
    # Present only when a sparser weather check level was used instead of the
    # requested one, because the requested level had too many points.
    strictness_demoted_to: NotRequired[str]


class GoogleRoutesError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _parse_response(payload: Any, weather_check: WeatherCheck) -> RoutesResponse:
    # Google guarantees the field types; only a changed response shape is caught.
    try:
        routes = [
            (
                # Google omits zero values, e.g. on a zero-length route.
                route.get("distanceMeters", 0),
                # Durations arrive as strings such as "14400s".
                float(route.get("duration", "0s").removesuffix("s")),
                route["polyline"]["encodedPolyline"],
            )
            for route in payload.get("routes", [])
        ]
        # Sampled together, since the weather point limit covers every route.
        applied_check, weather_points = collect_weather_points(
            [encoded for _, _, encoded in routes], weather_check
        )
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        raise GoogleRoutesError("Google Routes returned an unexpected route.") from exc
    result: RoutesResponse = {
        "routes": [
            {
                "distanceMeters": distance,
                "durationSeconds": seconds,
                "polyline": {"encodedPolyline": encoded},
                "weather_points": [
                    {"latitude": point.latitude, "longitude": point.longitude}
                    for point in points
                ],
            }
            for (distance, seconds, encoded), points in zip(routes, weather_points, strict=True)
        ]
    }
    # Skipped weather checks are signaled by the empty weather_points alone.
    if applied_check is not None and applied_check is not weather_check:
        result["strictness_demoted_to"] = applied_check.value
    return result


def compute_routes(route: RoutesRequest, api_key: str) -> RoutesResponse:
    api_key = api_key.strip()
    if not api_key:
        raise GoogleRoutesError("Google Routes API key is not configured.", 503)
    try:
        response = requests.post(
            ROUTES_API_URL,
            headers=build_routes_headers(api_key),
            json=build_routes_body(route),
            timeout=(5, 20),
            allow_redirects=False,
        )
    except requests.Timeout as exc:
        raise GoogleRoutesError("Google Routes request timed out.", 504) from exc
    except requests.RequestException as exc:
        raise GoogleRoutesError("Could not connect to Google Routes.") from exc
    if response.status_code != 200:
        raise GoogleRoutesError("Google Routes could not complete the request.")
    try:
        payload: Any = response.json()
    except ValueError as exc:
        raise GoogleRoutesError("Google Routes returned invalid JSON.") from exc
    return _parse_response(payload, route.weather_check)
