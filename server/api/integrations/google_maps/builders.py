from .validators import Coordinates, RoutesRequest

type JsonValue = (
    None | bool | int | float | str | list[JsonValue] | dict[str, JsonValue]
)

ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
ROUTES_FIELD_MASK = (
    "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
)


def build_routes_headers(api_key: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": ROUTES_FIELD_MASK,
    }


def _waypoint(coordinates: Coordinates) -> dict[str, JsonValue]:
    return {
        "location": {
            "latLng": {
                "latitude": coordinates.latitude,
                "longitude": coordinates.longitude,
            }
        }
    }


def build_routes_body(route: RoutesRequest) -> dict[str, JsonValue]:
    return {
        "origin": _waypoint(route.origin),
        "destination": _waypoint(route.destination),
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "computeAlternativeRoutes": True,
        "polylineEncoding": "ENCODED_POLYLINE",
    }
