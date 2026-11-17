from unittest.mock import patch

import requests
from django.http import HttpResponseNotAllowed, JsonResponse
from django.test import Client, SimpleTestCase, override_settings


@override_settings(GOOGLE_MAPS_API_KEY="test-server-key")
class GetRoutesTests(SimpleTestCase):
    def setUp(self):
        self.payload = {
            "origin": {"latitude": 28.6353, "longitude": -106.0889},
            "destination": {"latitude": 31.6904, "longitude": -106.4245},
        }
        self.google_result = {
            "routes": [
                {
                    "distanceMeters": 360000,
                    "duration": "14400s",
                    "polyline": {"encodedPolyline": "example-polyline"},
                }
            ]
        }
        patcher = patch("api.integrations.google_maps.client.requests.post")
        self.google_post = patcher.start()
        self.addCleanup(patcher.stop)
        self.google_post.return_value.status_code = 200
        self.google_post.return_value.json.return_value = self.google_result

    def post(self, payload: object) -> JsonResponse:
        response = self.client.post(
            "/api/get_routes",
            data=payload,
            content_type="application/json",
            headers={"Content-Type": "application/json"},
        )
        assert isinstance(response, JsonResponse)
        return response

    def test_computes_routes_without_database(self):
        response = self.post(self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(response.content.decode(), self.google_result)
        self.google_post.assert_called_once_with(
            "https://routes.googleapis.com/directions/v2:computeRoutes",
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": "test-server-key",
                "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
            },
            json={
                "origin": {"location": {"latLng": self.payload["origin"]}},
                "destination": {"location": {"latLng": self.payload["destination"]}},
                "travelMode": "DRIVE",
                "routingPreference": "TRAFFIC_AWARE",
                "computeAlternativeRoutes": True,
                "polylineEncoding": "ENCODED_POLYLINE",
            },
            timeout=(5, 20),
            allow_redirects=False,
        )

    def test_requires_post(self):
        response = self.client.get("/api/get_routes")
        assert isinstance(response, HttpResponseNotAllowed)
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.headers["Allow"], "POST")
        self.google_post.assert_not_called()

    def test_rejects_invalid_bodies_before_calling_google(self):
        invalid_payloads: list[object] = [
            None,
            [],
            True,
            {},
            {"origin": self.payload["origin"]},
        ]
        for value in [
            None,
            True,
            "28.6",
            [],
            {},
            91,
            -91,
            float("nan"),
            float("inf"),
            10**400,
        ]:
            invalid_payloads.append(
                {
                    **self.payload,
                    "origin": {"latitude": value, "longitude": 0},
                }
            )
        for value in [181, -181, "0", False]:
            invalid_payloads.append(
                {
                    **self.payload,
                    "destination": {"latitude": 0, "longitude": value},
                }
            )
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                self.assertEqual(self.post(payload).status_code, 400)
        self.google_post.assert_not_called()

    def test_rejects_malformed_json(self):
        for body in [b"{", b"", b"\xff"]:
            with self.subTest(body=body):
                self.assertEqual(self.post(body).status_code, 400)
        self.google_post.assert_not_called()

    def test_requires_json_content_type(self):
        response = self.client.post("/api/get_routes", data=self.payload)
        assert isinstance(response, JsonResponse)
        self.assertEqual(response.status_code, 415)
        self.google_post.assert_not_called()

    def test_accepts_coordinate_boundaries_and_zero(self):
        for latitude, longitude in [(90, 180), (-90, -180), (0, 0)]:
            with self.subTest(latitude=latitude, longitude=longitude):
                payload = {
                    "origin": {"latitude": latitude, "longitude": longitude},
                    "destination": {"latitude": 0, "longitude": 0},
                }
                self.assertEqual(self.post(payload).status_code, 200)

    @override_settings(GOOGLE_MAPS_API_KEY=" ")
    def test_missing_key_does_not_call_google(self):
        self.assertEqual(self.post(self.payload).status_code, 503)
        self.google_post.assert_not_called()

    def test_handles_no_routes(self):
        for result in [{}, {"routes": []}]:
            with self.subTest(result=result):
                self.google_post.return_value.json.return_value = result
                response = self.post(self.payload)
                self.assertEqual(response.status_code, 200)
                self.assertJSONEqual(response.content.decode(), {"routes": []})

    def test_handles_google_timeout(self):
        self.google_post.side_effect = requests.Timeout("private upstream details")
        response = self.post(self.payload)
        self.assertEqual(response.status_code, 504)
        self.assertNotIn(b"private upstream details", response.content)

    def test_handles_connection_failure(self):
        self.google_post.side_effect = requests.ConnectionError("private details")
        response = self.post(self.payload)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn(b"private details", response.content)

    def test_handles_google_error_statuses_without_leaking_details(self):
        for status in [302, 400, 403, 429, 500]:
            with self.subTest(status=status):
                self.google_post.return_value.status_code = status
                response = self.post(self.payload)
                self.assertEqual(response.status_code, 502)
                self.assertJSONEqual(
                    response.content.decode(),
                    {"error": "Google Routes could not complete the request."},
                )
        self.google_post.return_value.json.assert_not_called()

    def test_handles_google_invalid_json(self):
        self.google_post.return_value.json.side_effect = ValueError("not JSON")
        self.assertEqual(self.post(self.payload).status_code, 502)

    def test_handles_google_invalid_route_data(self):
        invalid_results = [
            None,
            [],
            {"error": {}},
            {"routes": {}},
            {"routes": [None]},
            {"routes": [{}]},
            {"routes": [{**self.google_result["routes"][0], "distanceMeters": -1}]},
            {"routes": [{**self.google_result["routes"][0], "duration": "bad"}]},
            {"routes": [{**self.google_result["routes"][0], "polyline": None}]},
        ]
        for result in invalid_results:
            with self.subTest(result=result):
                self.google_post.return_value.json.return_value = result
                self.assertEqual(self.post(self.payload).status_code, 502)

    def test_stateless_route_request_does_not_require_csrf_cookie(self):
        response = Client(enforce_csrf_checks=True).post(
            "/api/get_routes", data=self.payload, content_type="application/json"
        )
        assert isinstance(response, JsonResponse)
        self.assertEqual(response.status_code, 200)
        self.google_post.assert_called_once()
