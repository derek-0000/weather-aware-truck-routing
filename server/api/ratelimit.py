import time
from collections.abc import Callable
from functools import wraps

from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest, HttpResponse, JsonResponse

View = Callable[..., HttpResponse]


def client_ip(request: HttpRequest) -> str:
    # Vercel overwrites X-Forwarded-For with the real client IP, so it can only
    # be trusted there. Elsewhere a client could spoof it to dodge the limit.
    if settings.TRUST_FORWARDED_FOR:
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def _hit(key: str, period: int) -> int:
    if cache.add(key, 1, timeout=period):
        return 1
    try:
        return cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=period)
        return 1


def rate_limit(scope: str) -> Callable[[View], View]:
    def decorator(view: View) -> View:
        @wraps(view)
        def wrapper(request: HttpRequest, *args, **kwargs) -> HttpResponse:
            ip = client_ip(request)
            now = int(time.time())
            for limit, period in settings.RATE_LIMITS[scope]:
                window = now // period
                key = f"ratelimit:{scope}:{period}:{window}:{ip}"
                if _hit(key, period) > limit:
                    retry_after = (window + 1) * period - now
                    response = JsonResponse(
                        {"error": "Too many route requests. Please wait a moment and try again."},
                        status=429,
                    )
                    response["Retry-After"] = str(max(retry_after, 1))
                    return response
            return view(request, *args, **kwargs)

        return wrapper

    return decorator
