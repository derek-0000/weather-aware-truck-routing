from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .integrations.google_maps.client import GoogleRoutesError, compute_routes
from .integrations.google_maps.validators import (
    RequestValidationError,
    parse_request_coordinates,
)


@require_POST
@csrf_exempt
def get_routes(request: HttpRequest) -> JsonResponse:
    try:
        coordinates = parse_request_coordinates(request.body, request.content_type)
        result = compute_routes(coordinates, settings.GOOGLE_MAPS_API_KEY)
    except (RequestValidationError, GoogleRoutesError) as exc:
        return JsonResponse({"error": str(exc)}, status=exc.status_code)
    return JsonResponse(result)
