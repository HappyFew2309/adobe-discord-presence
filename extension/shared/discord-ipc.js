/*
 * Minimal Discord Rich Presence client over Discord's local IPC socket.
 * No dependencies: speaks the IPC framing protocol directly with Node's `net`.
 *
 * Frame = int32LE opcode + int32LE length + UTF-8 JSON payload.
 * Works in CEP (Node enabled) and plain Node (for tests).
 */
(function (root, factory) {
  var nodeRequire =
    (root && root.cep_node && root.cep_node.require) ||
    (typeof require === 'function' ? require : null);
  var nodeProcess =
    (root && root.cep_node && root.cep_node.process) ||
    (typeof process !== 'undefined' ? process : null);
  var api = factory(nodeRequire, nodeProcess);
  if (typeof window !== 'undefined') {
    window.DP = window.DP || {};
    window.DP.DiscordIPC = api.DiscordIPC;
  } else if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this, function (nodeRequire, nodeProcess) {
  var net = nodeRequire('net');
  var Buffer = nodeRequire('buffer').Buffer;
  var EventEmitter = nodeRequire('events').EventEmitter;

  var OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

  function pipeCandidates() {
    var list = [];
    var i;
    if (nodeProcess.platform === 'win32') {
      for (i = 0; i < 10; i++) list.push('\\\\?\\pipe\\discord-ipc-' + i);
      return list;
    }
    var env = nodeProcess.env || {};
    var base = (env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || '/tmp').replace(/\/+$/, '');
    var dirs = [base, base + '/app/com.discordapp.Discord', base + '/snap.discord'];
    for (var d = 0; d < dirs.length; d++) {
      for (i = 0; i < 10; i++) list.push(dirs[d] + '/discord-ipc-' + i);
    }
    return list;
  }

  function encode(op, payload) {
    var json = JSON.stringify(payload);
    var len = Buffer.byteLength(json, 'utf8');
    var buf = Buffer.alloc(8 + len);
    buf.writeInt32LE(op, 0);
    buf.writeInt32LE(len, 4);
    buf.write(json, 8, len, 'utf8');
    return buf;
  }

  function nonce() {
    return 'dp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * States: 'idle' | 'connecting' | 'connected' | 'error'
   * Events: 'state' (state, detail), 'ready' (user), 'log' (msg)
   */
  function DiscordIPC(clientId) {
    EventEmitter.call(this);
    this.clientId = clientId || '';
    this.socket = null;
    this.state = 'idle';
    this.lastError = '';
    this.user = null;
    this.pipe = '';
    this.activity = undefined; // last requested activity (null = cleared)
    this._buf = Buffer.alloc(0);
    this._nextRetry = 0;
    this._retryDelay = 3000;
    this._attempt = 0;
    this._readyTimer = null;
  }
  DiscordIPC.prototype = Object.create(EventEmitter.prototype);
  DiscordIPC.prototype.constructor = DiscordIPC;

  DiscordIPC.prototype._set = function (state, detail) {
    this.state = state;
    if (state === 'error') this.lastError = detail || 'Unknown error';
    if (state === 'connected') this.lastError = '';
    this.emit('state', state, detail);
  };

  DiscordIPC.prototype.setClientId = function (id) {
    id = String(id || '').trim();
    if (id === this.clientId) return;
    this.clientId = id;
    this.disconnect();
    this._nextRetry = 0;
    this._retryDelay = 3000;
  };

  /** Call often; connects when needed, honoring a backoff after failures. */
  DiscordIPC.prototype.ensure = function () {
    if (!this.clientId) return;
    if (this.state === 'connected' || this.state === 'connecting') return;
    if (Date.now() < this._nextRetry) return;
    this.connect();
  };

  DiscordIPC.prototype.connect = function () {
    if (!this.clientId) return;
    this.disconnect(true);
    this._set('connecting');
    this._tryPipe(pipeCandidates(), 0);
  };

  DiscordIPC.prototype._fail = function (msg) {
    this._cleanupSocket();
    this._nextRetry = Date.now() + this._retryDelay;
    this._retryDelay = Math.min(this._retryDelay * 2, 30000);
    this._set('error', msg);
  };

  DiscordIPC.prototype._tryPipe = function (paths, idx) {
    var self = this;
    if (idx >= paths.length) {
      this._fail('Discord is not running (no IPC pipe found)');
      return;
    }
    var attempt = ++this._attempt;
    var sock = net.createConnection(paths[idx]);
    var opened = false;
    sock.once('connect', function () {
      if (attempt !== self._attempt) return sock.destroy();
      opened = true;
      self.socket = sock;
      self.pipe = paths[idx];
      self._buf = Buffer.alloc(0);
      sock.on('data', function (chunk) { self._onData(chunk); });
      sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: self.clientId }));
      self._readyTimer = setTimeout(function () {
        self._fail('Discord did not answer the handshake');
      }, 8000);
    });
    sock.on('error', function (err) {
      if (attempt !== self._attempt) return;
      if (!opened) {
        sock.destroy();
        self._tryPipe(paths, idx + 1);
      } else {
        self._fail('Connection error: ' + (err && err.message));
      }
    });
    sock.on('close', function () {
      if (attempt !== self._attempt || !opened) return;
      if (self.state === 'connected' || self.state === 'connecting') {
        self._fail(self._closeReason || 'Discord closed the connection');
      }
    });
  };

  DiscordIPC.prototype._onData = function (chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    while (this._buf.length >= 8) {
      var op = this._buf.readInt32LE(0);
      var len = this._buf.readInt32LE(4);
      if (this._buf.length < 8 + len) break;
      var raw = this._buf.slice(8, 8 + len).toString('utf8');
      this._buf = this._buf.slice(8 + len);
      var msg = null;
      try { msg = JSON.parse(raw); } catch (e) { msg = null; }
      this._onMessage(op, msg);
    }
  };

  DiscordIPC.prototype._onMessage = function (op, msg) {
    if (op === OP.PING) {
      this._write(OP.PONG, msg || {});
      return;
    }
    if (op === OP.CLOSE) {
      var reason = (msg && msg.message) || 'Discord closed the connection';
      if (msg && msg.code === 4000) reason = 'Invalid Client ID — check it in the panel';
      this._closeReason = reason;
      this._fail(reason);
      return;
    }
    if (op !== OP.FRAME || !msg) return;
    if (msg.evt === 'READY') {
      clearTimeout(this._readyTimer);
      this.user = (msg.data && msg.data.user) || null;
      this._retryDelay = 3000;
      this._closeReason = '';
      this._set('connected');
      this.emit('ready', this.user);
      if (this.activity !== undefined) this._sendActivity(this.activity);
      return;
    }
    if (msg.evt === 'ERROR') {
      var m = (msg.data && msg.data.message) || 'Discord rejected the update';
      this.emit('log', 'Discord error: ' + m);
      this.lastError = m;
      this.emit('rpcError', m);
    }
  };

  DiscordIPC.prototype._write = function (op, payload) {
    if (!this.socket || this.socket.destroyed) return false;
    try { this.socket.write(encode(op, payload)); return true; } catch (e) { return false; }
  };

  DiscordIPC.prototype._sendActivity = function (activity) {
    var args = { pid: (nodeProcess && nodeProcess.pid) || 0 };
    if (activity) args.activity = activity;
    return this._write(OP.FRAME, { cmd: 'SET_ACTIVITY', args: args, nonce: nonce() });
  };

  /** Set (object) or clear (null) the presence. Re-sent automatically after reconnects. */
  DiscordIPC.prototype.setActivity = function (activity) {
    this.activity = activity || null;
    if (this.state === 'connected') this._sendActivity(this.activity);
  };

  DiscordIPC.prototype._cleanupSocket = function () {
    clearTimeout(this._readyTimer);
    if (this.socket) {
      try { this.socket.removeAllListeners('data'); this.socket.destroy(); } catch (e) {}
    }
    this.socket = null;
  };

  DiscordIPC.prototype.disconnect = function (silent) {
    this._attempt++;
    if (this.socket && this.state === 'connected') {
      try { this._write(OP.CLOSE, {}); } catch (e) {}
    }
    this._cleanupSocket();
    if (!silent && this.state !== 'idle') this._set('idle');
  };

  return { DiscordIPC: DiscordIPC, encode: encode, OP: OP, pipeCandidates: pipeCandidates };
});
