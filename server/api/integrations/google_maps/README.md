# Google Routes integration

`POST /api/get_routes` accepts JSON with two coordinates and a weather check level:

```json
{
  "origin": {"latitude": 28.6353, "longitude": -106.0889},
  "destination": {"latitude": 31.6904, "longitude": -106.4245},
  "weather_check": "lax"
}
```

Latitude must be a finite number between -90 and 90. Longitude must be a finite
number between -180 and 180. Strings, booleans, missing values, and null are rejected.
`weather_check` accepts `lax` for every 50 miles, `normal` for every 25 miles,
or `strict` for every 10 miles. Omitting it defaults to `lax`; invalid values
return `400` before calling Google.
Send `Content-Type: application/json`. This stateless endpoint is CSRF-exempt
and does not require a CSRF cookie or token. The Vite development server proxies
`/api` requests to Django on port 8000.

Set `GOOGLE_MAPS_API_KEY` in `server/.env`:

```dotenv
GOOGLE_MAPS_API_KEY=your-google-routes-api-key
```

Django loads this file when importing its settings, regardless of the current
working directory. Existing process environment variables take precedence over
values in the file. If you previously exported a key, run `unset GOOGLE_MAPS_API_KEY`
in that terminal to use the file's value instead. Restart Django after changing
the file. `server/.env` is ignored by Git; `server/.env.example` documents the
required variables and can be copied to `.env` on a new checkout.

Use a server API key with the Routes API enabled and billing configured. The
frontend's `VITE_GOOGLE_MAPS_API_KEY` is separate and is not used by this integration.

From the project root, install dependencies and run Django:

```sh
server/.venv/bin/python -m pip install -r server/requirements.txt
server/.venv/bin/python server/manage.py runserver
```

The integration calls Google's `computeRoutes` endpoint using traffic-aware
`DRIVE` routing and requests alternative routes. Google may return fewer than
three routes, or no routes. A successful response has the form:

```json
{
  "routes": [
    {
      "distanceMeters": 360000,
      "durationSeconds": 14400.0,
      "polyline": {"encodedPolyline": "..."},
      "weather_points": [
        {"latitude": 28.6353, "longitude": -106.0889},
        {"latitude": 29.359, "longitude": -106.168},
        {"latitude": 30.083, "longitude": -106.248},
        {"latitude": 30.807, "longitude": -106.328},
        {"latitude": 31.531, "longitude": -106.407},
        {"latitude": 31.6904, "longitude": -106.4245}
      ]
    }
  ]
}
```

The coordinates above illustrate the response shape. Each route's E5 encoded
polyline is decoded independently. Haversine distances are accumulated along
the path, and points are interpolated along the segment's great circle at each
interval. Distances use the decoded path rather than Google's `distanceMeters`.
The route's start and end coordinates are always included, even for trips shorter
than one interval. A destination that falls on an interval appears only once;
a zero-length route needs only one coordinate. For an exactly 200-mile route,
`lax` returns five points at 0, 50, 100, 150, and 200 miles. These are collection
locations for weather checks; this endpoint does not fetch weather forecasts.
The client requests one Open-Meteo forecast per point from the browser, so the
number of points is capped, with a fallback to sparser levels, as described in
`../open_meteo/README.md`.

No route found returns `200` with `{"routes": []}`. Invalid input returns `400`,
unsupported content type `415`, missing server key `503`, Google timeout `504`,
and other upstream failures or malformed responses `502`. Error responses use
`{"error": "..."}` without exposing Google credentials or raw provider errors.
Unsupported HTTP methods return Django's `405` response.

`validators.py` parses incoming JSON into coordinate/request dataclasses.
`builders.py` builds Google headers and body. `client.py` owns the HTTP call,
timeouts, errors, and response validation. `geometry.py` decodes polylines and
samples points along them; `open_meteo/weather_points.py` applies the weather
point cap and fallback. The view only connects these
pieces to Django's request and JSON response.

References: [Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions)
and [API reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes).
