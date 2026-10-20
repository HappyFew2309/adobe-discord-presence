/*
 * Local time tracking: how long you actively worked (not idle) per project and per day.
 * One file per app (time-PPRO.json, …) so apps never overwrite each other.
 * Stays on your computer — only the totals you put in your status text are shared.
 */
(function (root, factory) {
  var api = factory();
  if (typeof window !== 'undefined') {
    window.DP = window.DP || {};
    window.DP.TimeTrack = api;
  } else if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : this, function () {
  var KEEP_DAYS = 400;

  function dayKey(t) {
    var d = new Date(t);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function lastDays(now, n) {
    var out = [];
    var d = new Date(now);
    d.setHours(12, 0, 0, 0);
    for (var i = 0; i < n; i++) { out.push(dayKey(d.getTime())); d.setDate(d.getDate() - 1); }
    return out;
  }

  function empty() { return { v: 1, days: {}, projects: {} }; }

  /** store = { read(): data|null, write(data) } */
  function Tracker(store) {
    this.store = store;
    this.data = (store && store.read()) || empty();
    if (!this.data.days) this.data.days = {};
    if (!this.data.projects) this.data.projects = {};
    this.dirty = false;
    this.lastSave = Date.now();
  }

  Tracker.prototype.add = function (project, seconds, now) {
    if (!project || !(seconds > 0)) return;
    now = now || Date.now();
    var k = dayKey(now);
    var day = this.data.days[k] || (this.data.days[k] = { total: 0, projects: {} });
    day.total += seconds;
    day.projects[project] = (day.projects[project] || 0) + seconds;
    var p = this.data.projects[project] || (this.data.projects[project] = { total: 0, first: now });
    p.total += seconds;
    p.last = now;
    this.dirty = true;
  };

  Tracker.prototype.today = function (now) {
    var d = this.data.days[dayKey(now || Date.now())];
    return d ? d.total : 0;
  };

  Tracker.prototype.week = function (now) {
    var keys = lastDays(now || Date.now(), 7), t = 0;
    for (var i = 0; i < keys.length; i++) if (this.data.days[keys[i]]) t += this.data.days[keys[i]].total;
    return t;
  };

  Tracker.prototype.project = function (name) {
    var p = this.data.projects[name];
    return p ? p.total : 0;
  };

  Tracker.prototype.save = function (force) {
    if (!this.dirty || !this.store) return;
    if (!force && Date.now() - this.lastSave < 30000) return;
    var cutoff = dayKey(Date.now() - KEEP_DAYS * 86400000);
    for (var k in this.data.days) if (this.data.days.hasOwnProperty(k) && k < cutoff) delete this.data.days[k];
    try { this.store.write(this.data); this.dirty = false; this.lastSave = Date.now(); } catch (e) {}
  };

  /** For the panel: combine every app's file into today / week / top projects. */
  function summarize(byHost, now) {
    now = now || Date.now();
    var today = dayKey(now), week = lastDays(now, 7);
    var out = { today: 0, week: 0, apps: {}, projects: [], days: [] };
    var projects = {};
    var perDay = {};
    for (var h in byHost) {
      if (!byHost.hasOwnProperty(h) || !byHost[h]) continue;
      var data = byHost[h];
      var a = { today: 0, week: 0 };
      for (var i = 0; i < week.length; i++) {
        var d = data.days && data.days[week[i]];
        if (!d) continue;
        a.week += d.total;
        perDay[week[i]] = (perDay[week[i]] || 0) + d.total;
        if (week[i] === today) a.today += d.total;
        for (var p in d.projects) {
          if (!d.projects.hasOwnProperty(p)) continue;
          var key = h + '|' + p;
          if (!projects[key]) projects[key] = { host: h, name: p, week: 0, total: (data.projects[p] || {}).total || 0 };
          projects[key].week += d.projects[p];
        }
      }
      out.apps[h] = a;
      out.today += a.today;
      out.week += a.week;
    }
    for (var k in projects) if (projects.hasOwnProperty(k)) out.projects.push(projects[k]);
    out.projects.sort(function (x, y) { return y.week - x.week; });
    for (var j = week.length - 1; j >= 0; j--) out.days.push({ day: week[j], total: perDay[week[j]] || 0 });
    return out;
  }

  return { Tracker: Tracker, summarize: summarize, dayKey: dayKey, lastDays: lastDays };
});
