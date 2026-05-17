// Tiny Node.js script written to a temp file — reads stdin JSON from Claude
// Code's statusLine and POSTs it to CCC's HookServer. Uses CCC_PORT and
// CCC_SESSION_ID env vars injected by the platform adapter's launch script.
// Pure Node, no platform-specific syscalls — shared between WindowsAdapter
// and MacOSAdapter.
export const STATUSLINE_RELAY_JS = `'use strict';
const http = require('http');
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function(c) { raw += c; });
process.stdin.on('end', function() {
  const port = process.env.CCC_PORT;
  const sid  = process.env.CCC_SESSION_ID;
  if (!port || !sid) return;
  let data;
  try { data = JSON.parse(raw); } catch(e) { return; }
  const body = JSON.stringify({ sessionId: parseInt(sid, 10), data: data });
  const opts = {
    hostname: '127.0.0.1',
    port: parseInt(port, 10),
    path: '/statusline',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  };
  const req = http.request(opts, function() {});
  req.on('error', function() {});
  req.write(body);
  req.end();
});
`
