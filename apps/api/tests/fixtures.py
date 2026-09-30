"""Minimal payloads shaped like the real upstream API responses."""

# Tile 15/23724/14860 covers central Vijayawada:
# lat 16.49930..16.50983, lon 80.63965..80.65063
TILE = (15, 23724, 14860)

OVERPASS = {
    "elements": [
        {   # building with levels
            "type": "way", "id": 1,
            "tags": {"building": "apartments", "building:levels": "5", "name": "Sample Towers"},
            "geometry": [
                {"lat": 16.5050, "lon": 80.6450}, {"lat": 16.5050, "lon": 80.6452},
                {"lat": 16.5052, "lon": 80.6452}, {"lat": 16.5052, "lon": 80.6450},
                {"lat": 16.5050, "lon": 80.6450},
            ],
        },
        {   # untagged house → estimated height
            "type": "way", "id": 2, "tags": {"building": "yes"},
            "geometry": [
                {"lat": 16.5040, "lon": 80.6440}, {"lat": 16.5040, "lon": 80.6441},
                {"lat": 16.5041, "lon": 80.6441}, {"lat": 16.5041, "lon": 80.6440},
                {"lat": 16.5040, "lon": 80.6440},
            ],
        },
        {   # explicit height in feet + hospital amenity → building and place
            "type": "way", "id": 3,
            "tags": {"building": "hospital", "height": "66'", "amenity": "hospital", "name": "Sample Hospital"},
            "geometry": [
                {"lat": 16.5030, "lon": 80.6430}, {"lat": 16.5030, "lon": 80.6433},
                {"lat": 16.5033, "lon": 80.6433}, {"lat": 16.5033, "lon": 80.6430},
                {"lat": 16.5030, "lon": 80.6430},
            ],
        },
        {   # multipolygon split across two outer ways
            "type": "relation", "id": 4, "tags": {"building": "commercial", "type": "multipolygon"},
            "members": [
                {"type": "way", "role": "outer", "geometry": [
                    {"lat": 16.5020, "lon": 80.6420}, {"lat": 16.5020, "lon": 80.6424},
                    {"lat": 16.5024, "lon": 80.6424},
                ]},
                {"type": "way", "role": "outer", "geometry": [
                    {"lat": 16.5024, "lon": 80.6424}, {"lat": 16.5024, "lon": 80.6420},
                    {"lat": 16.5020, "lon": 80.6420},
                ]},
            ],
        },
        {   # centroid in the neighbouring tile → excluded
            "type": "way", "id": 5, "tags": {"building": "yes"},
            "geometry": [
                {"lat": 16.5098, "lon": 80.6450}, {"lat": 16.5098, "lon": 80.6452},
                {"lat": 16.5102, "lon": 80.6452}, {"lat": 16.5102, "lon": 80.6450},
                {"lat": 16.5098, "lon": 80.6450},
            ],
        },
        {   # point of interest
            "type": "node", "id": 6, "lat": 16.5010, "lon": 80.6410,
            "tags": {"amenity": "police", "name": "Sample Police Station"},
        },
    ]
}

OPEN_METEO = {
    "latitude": 16.5, "longitude": 80.625, "elevation": 23.0, "timezone": "Asia/Kolkata",
    "utc_offset_seconds": 19800,
    "current": {
        "time": "2026-09-30T09:45", "temperature_2m": 30.5, "apparent_temperature": 33.3,
        "relative_humidity_2m": 42, "wind_speed_10m": 2.2, "wind_gusts_10m": 8.0,
        "wind_direction_10m": 10, "precipitation": 0.0, "cloud_cover": 0,
        "surface_pressure": 1008.1, "uv_index": 6.2, "weather_code": 0, "is_day": 1,
    },
    "hourly": {
        "time": [f"2026-09-30T{h:02d}:00" for h in range(24)] + [f"2026-10-01T{h:02d}:00" for h in range(24)],
        "temperature_2m": [28 + (h % 24) / 3 for h in range(48)],
        "apparent_temperature": [31 + (h % 24) / 3 for h in range(48)],
        "precipitation": [0.0] * 14 + [20.0, 25.0, 15.0, 10.0] + [0.0] * 30,
        "precipitation_probability": [10] * 48,
        "wind_gusts_10m": [10.0] * 48,
        "weather_code": [0] * 14 + [95] + [0] * 33,
    },
    "daily": {
        "temperature_2m_max": [36.1, 35.0], "temperature_2m_min": [26.0, 25.5],
        "sunrise": ["2026-09-30T05:58", "2026-10-01T05:58"],
        "sunset": ["2026-09-30T17:53", "2026-10-01T17:52"],
    },
}

AIR_QUALITY = {
    "latitude": 16.5, "longitude": 80.6, "utc_offset_seconds": 19800,
    "hourly": {
        "time": [f"2026-09-29T{h:02d}:00" for h in range(24)] + [f"2026-09-30T{h:02d}:00" for h in range(24)],
        "pm2_5": [45.0] * 48,
        "pm10": [80.0] * 48,
        "nitrogen_dioxide": [20.0] * 48,
        "ozone": [60.0] * 48,
        "sulphur_dioxide": [8.0] * 48,
        "carbon_monoxide": [400.0] * 48,
    },
}

NOMINATIM_SEARCH = [
    {
        "place_id": 1, "osm_type": "relation", "osm_id": 1972123, "lat": "16.5115306",
        "lon": "80.6160469", "name": "Vijayawada", "addresstype": "city",
        "display_name": "Vijayawada, NTR, Andhra Pradesh, India",
        "boundingbox": ["16.4498", "16.5773", "80.5652", "80.7038"],
        "address": {"city": "Vijayawada", "state_district": "NTR", "state": "Andhra Pradesh", "country": "India"},
    }
]

NOMINATIM_REVERSE = {
    "address": {"suburb": "Governorpet", "city": "Vijayawada", "state_district": "NTR", "state": "Andhra Pradesh"}
}
