# Google Routes integration

`POST /api/get_routes` accepts JSON with two coordinates:

```json
{
  "origin": {"latitude": 28.6353, "longitude": -106.0889},
  "destination": {"latitude": 31.6904, "longitude": -106.4245}
}
```

Latitude must be a finite number between -90 and 90. Longitude must be a finite
number between -180 and 180. Strings, booleans, missing values, and null are rejected.
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
      "duration": "14400s",
      "polyline": {"encodedPolyline": "..."}
    }
  ]
}
```

No route found returns `200` with `{"routes": []}`. Invalid input returns `400`,
unsupported content type `415`, missing server key `503`, Google timeout `504`,
and other upstream failures or malformed responses `502`. Error responses use
`{"error": "..."}` without exposing Google credentials or raw provider errors.
Unsupported HTTP methods return Django's `405` response.

`validators.py` parses incoming JSON into coordinate/request dataclasses.
`builders.py` builds Google headers and body. `client.py` owns the HTTP call,
timeouts, errors, and response validation. The view only connects these pieces
to Django's request and JSON response.

Run the endpoint tests without a database or live Google calls:

```sh
server/.venv/bin/python server/manage.py test api
```

References: [Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions)
and [API reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes).
