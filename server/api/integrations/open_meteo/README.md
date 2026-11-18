# Open-Meteo integration

The server never calls Open-Meteo. The client requests one Open-Meteo forecast
per weather point from the browser (see `client/src/lib/weather.ts`), so each
user spends their own per-IP quota. This module decides how many weather points
the `get_routes` response may contain so the client stays within that quota.

Every point costs one Open-Meteo call, and the free tier allows 600 calls per
minute, so the total across all routes, including alternatives, is capped at 600
points. If the requested level exceeds the cap, the endpoint falls back to the
next sparser level: `strict` to `normal`, then `normal` to `lax`. If even `lax`
exceeds it, every route returns `"weather_points": []`, and the client makes no
weather requests. Whenever a sparser level is used instead, the response includes
a top-level `"strictness_demoted_to"` with that level (`"normal"` or `"lax"`). The
key is absent when the requested level was used, and when weather checks were
skipped, since the empty `weather_points` already show that.

`weather_points.py` decodes each route's polyline, samples it at the weather
check interval using `google_maps/geometry.py`, and applies the cap and fallback.

Reference: [Open-Meteo pricing and limits](https://open-meteo.com/en/pricing).
