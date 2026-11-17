import json
import math
from dataclasses import dataclass


class RequestValidationError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class Coordinates:
    latitude: float
    longitude: float


@dataclass(frozen=True)
class RoutesRequest:
    origin: Coordinates
    destination: Coordinates


def _number(value: object, field: str, limit: int) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RequestValidationError(f"{field} must be a number.")
    # Compare before converting to float, so even enormous JSON integers are safe.
    if not -limit <= value <= limit:
        raise RequestValidationError(f"{field} must be between {-limit} and {limit}.")
    number = float(value)
    if not math.isfinite(number):
        raise RequestValidationError(f"{field} must be finite.")
    return number


def _coordinates(value: object, field: str) -> Coordinates:
    if not isinstance(value, dict):
        raise RequestValidationError(f"{field} must contain latitude and longitude.")
    return Coordinates(
        latitude=_number(value.get("latitude"), f"{field}.latitude", 90),
        longitude=_number(value.get("longitude"), f"{field}.longitude", 180),
    )


def parse_request_coordinates(body: bytes, content_type: str | None) -> RoutesRequest:
    if content_type != "application/json":
        raise RequestValidationError("Content-Type must be application/json.", 415)
    try:
        payload: object = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError) as exc:
        raise RequestValidationError("Body must be valid UTF-8 JSON.") from exc
    if not isinstance(payload, dict):
        raise RequestValidationError("Body must be a JSON object.")
    return RoutesRequest(
        origin=_coordinates(payload.get("origin"), "origin"),
        destination=_coordinates(payload.get("destination"), "destination"),
    )
