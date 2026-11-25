#!/usr/bin/env bash
set -euo pipefail

# Serve tools/qr-importer.html on LAN so iPhone Safari can decode QR screenshots.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PORT="${1:-8787}"

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ifconfig | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')"

echo "[SecureKey] Starting offline QR Importer Bridge on port ${PORT}..."
echo "[SecureKey] Open this URL in iPhone Safari (same Wi-Fi): http://${LAN_IP}:${PORT}"
echo "[SecureKey] Press Ctrl+C when finished."

cd "${PROJECT_ROOT}"
node - <<'NODE' "${PORT}" "${LAN_IP}"
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const port = Number(process.argv[2] || 8787)
const lanIp = process.argv[3] || '127.0.0.1'
const toolsDir = path.resolve(process.cwd(), 'tools')

// Store decoded QR payload transiently in RAM and clear after read.
let pendingPayload = ''

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/' || req.url === '/qr-importer.html') {
    const html = fs.readFileSync(path.join(toolsDir, 'qr-importer.html'))
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    })
    res.end(html)
    return
  }

  if (req.url === '/jsQR.js') {
    const js = fs.readFileSync(path.join(toolsDir, 'jsQR.js'))
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
    res.end(js)
    return
  }

  if (req.url === '/api/pending' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 262144) req.destroy()
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        pendingPayload = String(data.payload || '').trim()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, length: pendingPayload.length }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
    return
  }

  if (req.url === '/api/pending' && req.method === 'GET') {
    const payload = pendingPayload
    pendingPayload = ''
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ payload }))
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Listening on http://${lanIp}:${port}`)
})
NODE
