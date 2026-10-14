#!/usr/bin/env bash
echo "========================================================"
echo "  Starting Somphea Reak Admin Panel (Port 8082)"
echo "========================================================"
echo ""
echo "  URL: http://localhost:8082"
echo ""

EXPO_NO_TELEMETRY=1 npx expo start --web --port 8082
