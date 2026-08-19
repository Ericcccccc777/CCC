// Tiny Node.js script written to disk — reads stdin JSON from Claude Code's
// statusLine and POSTs it to CCC's HookServer. Pure Node, no platform-specific
// syscalls — shared between WindowsAdapter and MacOSAdapter.
//
// Session identity comes from the CCC_SESSION_ID env var the launch script
// exports, which is correct: it is per-terminal and never changes.
//
// The PORT must not come from the environment. CCC's hook server binds an
// ephemeral port, fresh on every app start, and a terminal's env is frozen at
// `exec claude` time — nothing can update a running shell's environment. So a
// terminal that outlived an app restart (crash, Force Quit, dev reload,
// update) POSTed to a dead port forever and its readouts froze, silently,
// because the relay swallows the error. Instead the live port is read from a
// file the hook server rewrites on every start. The path is baked in here at
// write time rather than passed through the env, because it is stable across
// app runs (it lives under userData) and because this script is shared by every
// terminal — rewriting it updates all of them at once. CCC_PORT stays as a
// fallback so a terminal still running an older copy of this script keeps
// working exactly as before.
export function buildStatusLineRelay(portFilePath: string): string {
  return `'use strict';
const http = require('http');
const fs   = require('fs');
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function(c) { raw += c; });
process.stdin.on('end', function() {
  let port = '';
  try { port = fs.readFileSync(${JSON.stringify(portFilePath)}, 'utf8').trim(); } catch (e) {}
  if (!port) port = process.env.CCC_PORT;
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
}
