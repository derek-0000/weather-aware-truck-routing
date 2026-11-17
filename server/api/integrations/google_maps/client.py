import re

import requests

from .builders import ROUTES_API_URL, build_routes_body, build_routes_headers
from .validators import RoutesRequest


class GoogleRoutesError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _parse_response(payload: object) -> dict[str, object]:
    if not isinstance(payload, dict) or "error" in payload:
        raise GoogleRoutesError("Google Routes returned an invalid response.")
    routes = payload.get("routes", [])
    if not isinstance(routes, list):
        raise GoogleRoutesError("Google Routes returned invalid routes.")
    for route in routes:
        if not isinstance(route, dict):
            raise GoogleRoutesError("Google Routes returned an invalid route.")
        distance = route.get("distanceMeters", 0)
        duration = route.get("duration")
        polyline = route.get("polyline")
        if (
            isinstance(distance, bool)
            or not isinstance(distance, int)
            or distance < 0
            or not isinstance(duration, str)
            or re.fullmatch(r"\d+(?:\.\d{1,9})?s", duration) is None
            or not isinstance(polyline, dict)
            or not isinstance(polyline.get("encodedPolyline"), str)
        ):
            raise GoogleRoutesError("Google Routes returned an invalid route.")
    return {"routes": routes}


def compute_routes(route: RoutesRequest, api_key: str) -> dict[str, object]:
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
        payload: object = response.json()
    except ValueError as exc:
        raise GoogleRoutesError("Google Routes returned invalid JSON.") from exc
    return _parse_response(payload)
