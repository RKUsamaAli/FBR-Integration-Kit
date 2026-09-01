#!/usr/bin/env node
/**
 * fbr-proxy.js — a small CORS relay so fbr-test-harness.html can call FBR from a browser.
 *
 * WHY THIS EXISTS
 * gw.fbr.gov.pk does not send Access-Control-Allow-Origin headers, so a browser refuses to let
 * page JavaScript read FBR's reply — even when FBR answered correctly. The failure looks like
 * "Failed to fetch" and is indistinguishable from FBR being down. This relay runs on your own
 * machine, forwards the request server-side (no CORS in Node), and returns the reply with
 * permissive CORS headers so the harness can display it.
 *
 * RUN:    node fbr-proxy.js            (listens on http://localhost:8787)
 *         PORT=9000 node fbr-proxy.js  (custom port)
 * USE:    In fbr-test-harness.html put http://localhost:8787/proxy in the "Proxy URL" box.
 *
 * The harness sends: POST http://localhost:8787/proxy
 *                    headers: x-fbr-target: <the real FBR url>, x-fbr-token: <your token>
 *                    body:    the invoice JSON
 *
 * SECURITY: binds to 127.0.0.1 only and never logs the token. It is a developer tool — do not
 * deploy it and do not put it on a shared host. Your production integration must call FBR from
 * your own backend, never from a browser.
 *
 * Requires Node 18+ (uses global fetch).
 */
const http = require('http');
const PORT = process.env.PORT || 8787;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-fbr-target,x-fbr-token',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  const target = req.headers['x-fbr-target'];
  const token = req.headers['x-fbr-token'];
  if (!target) {
    res.writeHead(400, { ...CORS, 'content-type': 'application/json' });
    return res.end('{"error":"x-fbr-target header is missing"}');
  }

  let body = '';
  req.on('data', c => (body += c));
  req.on('end', async () => {
    const started = Date.now();
    try {
      const upstream = await fetch(target, {
        method: req.method === 'GET' ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        ...(req.method === 'GET' ? {} : { body }),
      });
      const text = await upstream.text();
      console.log(new Date().toISOString() + '  ' + upstream.status + '  ' + (Date.now() - started) + 'ms  ' + target);
      res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
      res.end(JSON.stringify({ httpStatus: upstream.status, body: text }));
    } catch (err) {
      console.error(new Date().toISOString() + '  RELAY-FAIL  ' + target + '  ' + err.message);
      res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
      res.end(JSON.stringify({ httpStatus: 0, body: '', relayError: String(err.message || err) }));
    }
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('FBR relay listening on http://localhost:' + PORT + '/proxy  (Ctrl+C to stop)');
});
