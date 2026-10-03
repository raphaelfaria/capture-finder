// Starts the app's static server for the browser tests: `npx http-server` (the same one
// `npm start` uses) on a free local port, and stops it again.
//   const server = await serve(root); … server.url … await server.close();
const { spawn } = require('node:child_process');
const net = require('node:net');

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

async function serve(root) {
  const port = await freePort();
  // Own process group, so stopping it also stops the http-server process npx starts.
  const child = spawn('npx', ['--no-install', 'http-server', root, '-p', String(port), '-a', '127.0.0.1', '-c-1', '-d', 'false', '-s'], { stdio: 'ignore', detached: true });
  const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { /* already gone */ } };
  process.once('exit', stop);
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('http-server exited; run npm install first');
    try { await fetch(url); break; } catch (_) { /* not up yet (any response means it is serving) */ }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) { stop(); throw new Error('http-server did not start'); }
  }
  return { url, close: () => new Promise((r) => { if (child.exitCode !== null) return r(); child.once('exit', r); stop(); }) };
}

module.exports = { serve };
