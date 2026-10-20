// Fake Discord IPC server for tests. Listens on $XDG_RUNTIME_DIR/discord-ipc-0.
const net = require('net');
const fs = require('fs');
const path = require('path');

function frame(op, obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const b = Buffer.alloc(8 + json.length);
  b.writeInt32LE(op, 0); b.writeInt32LE(json.length, 4); json.copy(b, 8);
  return b;
}

function start(dir, opts = {}) {
  const p = path.join(dir, 'discord-ipc-0');
  try { fs.unlinkSync(p); } catch (e) {}
  const received = [];
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      while (buf.length >= 8) {
        const op = buf.readInt32LE(0), len = buf.readInt32LE(4);
        if (buf.length < 8 + len) break;
        const msg = JSON.parse(buf.slice(8, 8 + len).toString('utf8'));
        buf = buf.slice(8 + len);
        received.push({ op, msg });
        if (op === 0) {
          if (opts.rejectClientId && msg.client_id === opts.rejectClientId) {
            sock.write(frame(2, { code: 4000, message: 'Invalid Client ID' }));
            sock.end();
          } else {
            sock.write(frame(1, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1, user: { username: 'tester' } } }));
          }
        } else if (op === 1 && msg.cmd === 'SET_ACTIVITY') {
          const a = msg.args.activity;
          const bad = a && ((a.details && a.details.length < 2) || (a.state && a.state.length < 2));
          sock.write(frame(1, bad
            ? { cmd: 'SET_ACTIVITY', evt: 'ERROR', nonce: msg.nonce, data: { code: 4000, message: 'child "details" fails' } }
            : { cmd: 'SET_ACTIVITY', evt: null, nonce: msg.nonce, data: a || null }));
        }
      }
    });
  });
  return new Promise((res) => server.listen(p, () => res({ server, received, path: p })));
}

module.exports = { start };
