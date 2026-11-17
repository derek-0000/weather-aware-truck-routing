# weather-aware-truck-routing

## Architecture

Client (React) -> Server (Django) -> Google Maps API

Client (React) -> Open-Meteo API

### Client

The client integrates the server responses into an interactive map build on top of `react-google-maps`. It handles HTTP requests through `@tanstack/react-query` and provides the response data through the React `context` API. At the same time the form is handled through `useDispatch` and its desig sistem is base `shadcn + Tailwind + BaseUi`

### Server

The server application utilices the `Django` framework working as the bridge to communicat with the external APIs and and prepare the data for the client. In the `integrations`dir are the definitions of each module that handles the communication with the external APIs. These include, HTTP requests, response validators, body validators and data computing utilities. These are used in the views defined in `Django` acting as the endpoints fro the client to hit. These endpoints are rate limited to avoid abuse

### External APIs

- Google Maps API. The google maps provides the server with the routes and polyline to render in the client/obtain coordinate points for the weather check. And the map rendered in the client.
- Open-Meteo API. The Open-Meteo API provides the client with the weather data for the coordinates the server obtained from the Google Maps API.

## Design Desicions

Based on the requirements of the project and limitations of the chosen external APIs, the following behaviors were implemented:

- Each weather point is fetched in its own Open-Meteo request for its own rounded ETA. Requests are sent in batches of 10: each batch must resolve before the next one starts, because sending many at once times out. Open-Meteo also caps simultaneous requests per IP and may reject some requests in a batch with `429 Too many concurrent requests`; only those are retried after a short delay.
- Requesting a different route with any new values has to be submited manually. Same argument, we do not fetch routes on dirty to avoid excedign limits on Open-Meteo.
- Open-Meteo only provides weather data on 15 minute intervals so weather point requests are rounded to the nearest 15 minute interval. Allowing weather data to skew by at most 7.5 minutes.
- Open-Meteo has a the following restrictions `600 calls / min`, `5.000 calls / hour`, `10.000 calls / day`(Free tier) Very large trips on `Strict` weather checks requests will timeout. App fallbacks to nearest weather check level that will not cause timeout. Eg. 600+ point routes will fallback to `Moderate`, if moderate still has 600+ points, it will fallback to `Lax` not providing weather data if this mode will time out to.
- Given the previous point, the application does the Open-Meteo matching on the client, this makes it so users do not share the same pool by requests occuring through the server.
