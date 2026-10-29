#!/bin/sh
# Create a fresh, realistic half-finished Git project for trying the Vault.
# Never touches an existing project; prints the absolute path to paste into the app.
set -eu
DEMO=$(mktemp -d "${HOME}/vault-demo.XXXXXX")
P="$DEMO/weather-dashboard"
mkdir -p "$P/src"
git -C "$P" init -q
printf '# Weather dashboard\n\nRun: node src/server.js\n' > "$P/README.md"
printf 'export function fetchForecast(city) {\n  return fetch(`https://api.example.invalid/forecast?city=${city}`).then((r) => r.json());\n}\n' > "$P/src/api.js"
git -C "$P" add README.md src/api.js
git -C "$P" -c user.name='Vault Demo' -c user.email='vault-demo@example.invalid' commit -qm 'Initial dashboard'
# Unfinished work: an uncommitted edit, a new untracked file and a local secret.
printf 'export async function fetchForecast(city) {\n  const response = await fetch(`https://api.example.invalid/forecast?city=${encodeURIComponent(city)}`);\n  // TODO: API returns 429 after a few refreshes; add backoff before the chart polls again\n  if (!response.ok) throw new Error(`Forecast failed: ${response.status}`);\n  return response.json();\n}\n' > "$P/src/api.js"
printf 'export function renderChart(points) {\n  // Half-built: axis labels still missing\n  return points.map((p) => `${p.time}: ${p.temp}`).join("\\n");\n}\n' > "$P/src/chart.js"
printf 'WEATHER_API_KEY=example-only-not-real\n' > "$P/.env"
printf '%s\n' "$P"
