/*
 * ExtendScript side: reads what you're working on and returns it as JSON.
 * Runs inside Premiere Pro or After Effects. Read-only — never changes your project.
 */
var DiscordPresenceHost = (function () {
  function quote(s) {
    s = String(s);
    var out = '"';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var code = s.charCodeAt(i);
      if (c === '"') out += '\\"';
      else if (c === '\\') out += '\\\\';
      else if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (code < 32) out += '\\u' + ('000' + code.toString(16)).slice(-4);
      else out += c;
    }
    return out + '"';
  }

  function toJSON(v) {
    if (v === null || v === undefined) return 'null';
    var t = typeof v;
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return quote(v);
    if (v instanceof Array) {
      var a = [];
      for (var i = 0; i < v.length; i++) a.push(toJSON(v[i]));
      return '[' + a.join(',') + ']';
    }
    var parts = [];
    for (var k in v) {
      if (v.hasOwnProperty(k) && v[k] !== undefined) parts.push(quote(k) + ':' + toJSON(v[k]));
    }
    return '{' + parts.join(',') + '}';
  }

  var TICKS = 254016000000; // Premiere ticks per second

  function premiere() {
    var o = { host: 'PPRO', hasProject: false };
    try { o.version = String(app.version); } catch (e) {}
    try { if (app.projects && app.projects.numProjects === 0) return o; } catch (e) {}
    var p = null;
    try { p = app.project; } catch (e) {}
    if (!p) return o;
    var name = '';
    try { name = String(p.name || ''); } catch (e) {}
    if (!name) return o;
    o.hasProject = true;
    o.project = name.replace(/\.prproj$/i, '');
    try { o.path = String(p.path || ''); } catch (e) {}
    try { o.sequences = p.sequences.numSequences; } catch (e) {}
    try { o.items = p.rootItem.children.numItems; } catch (e) {}

    var s = null;
    try { s = p.activeSequence; } catch (e) {}
    if (!s) return o;
    try { o.sequence = String(s.name); } catch (e) {}
    try { o.width = Number(s.frameSizeHorizontal); o.height = Number(s.frameSizeVertical); } catch (e) {}
    try { var tb = Number(s.timebase); if (tb > 0) o.fps = TICKS / tb; } catch (e) {}
    try { o.duration = Number(s.end) / TICKS; } catch (e) {}
    try { o.playhead = Number(s.getPlayerPosition().ticks) / TICKS; } catch (e) {}
    try {
      var vt = s.videoTracks, clips = 0;
      o.videoTracks = vt.numTracks;
      for (var i = 0; i < vt.numTracks; i++) clips += vt[i].clips.numItems;
      o.clips = clips;
    } catch (e) {}
    try {
      var at = s.audioTracks, aclips = 0;
      o.audioTracks = at.numTracks;
      for (var j = 0; j < at.numTracks; j++) aclips += at[j].clips.numItems;
      o.audioClips = aclips;
    } catch (e) {}
    try { var sel = s.getSelection(); o.selected = sel ? sel.length : 0; } catch (e) {}
    return o;
  }

  // Counting comps walks the whole project, so only redo it when the item count changes.
  var compCache = { n: -1, comps: 0 };

  function afterEffects() {
    var o = { host: 'AEFT', hasProject: false };
    try { o.version = String(app.version); } catch (e) {}
    var p = null;
    try { p = app.project; } catch (e) {}
    if (!p) return o;
    var n = 0;
    try { n = p.numItems; } catch (e) {}
    var f = null;
    try { f = p.file; } catch (e) {}
    if (!f && n === 0) return o; // fresh, empty untitled project = nothing open
    o.hasProject = true;
    o.project = f ? decodeURI(f.name).replace(/\.aepx?$/i, '') : 'Untitled Project';
    o.saved = !!f;
    try { if (f && f.fsName) o.path = String(f.fsName); } catch (e) {}
    o.items = n;

    if (compCache.n !== n) {
      var c = 0;
      try { for (var i = 1; i <= n; i++) if (p.item(i) instanceof CompItem) c++; } catch (e) {}
      compCache.n = n;
      compCache.comps = c;
    }
    o.comps = compCache.comps;

    var a = null;
    try { a = p.activeItem; } catch (e) {}
    if (a) {
      try {
        if (a instanceof CompItem) {
          o.comp = String(a.name);
          o.width = a.width;
          o.height = a.height;
          o.fps = a.frameRate;
          o.duration = a.duration;
          o.playhead = a.time;
          o.layers = a.numLayers;
          o.selected = a.selectedLayers.length;
        } else {
          o.item = String(a.name);
          if (a.width) { o.width = a.width; o.height = a.height; }
        }
      } catch (e) {}
    }

    try {
      var rq = p.renderQueue;
      o.rendering = !!rq.rendering;
      var queued = 0;
      for (var r = 1; r <= rq.numItems; r++) {
        var it = rq.item(r);
        if (it.status === RQItemStatus.QUEUED) queued++;
        else if (it.status === RQItemStatus.RENDERING) {
          try { o.renderComp = String(it.comp.name); } catch (e) {}
        }
      }
      o.queued = queued;
    } catch (e) {}
    return o;
  }

  function stripExt(n) { return String(n).replace(/\.[^.\/\\]+$/, ''); }
  function baseName(p) { return String(p || '').replace(/^.*[\/\\]/, ''); }

  // ---- Photoshop -----------------------------------------------------------
  var PS_TOOLS = {
    moveTool: 'Move', artboardTool: 'Artboard', marqueeRectTool: 'Marquee', marqueeEllipTool: 'Marquee',
    lassoTool: 'Lasso', polySelTool: 'Lasso', magneticLassoTool: 'Lasso', quickSelectTool: 'Quick Select',
    magicWandTool: 'Magic Wand', cropTool: 'Crop', perspectiveCropTool: 'Crop', sliceTool: 'Slice',
    eyedropperTool: 'Eyedropper', spotHealingBrushTool: 'Healing Brush', magicStampTool: 'Healing Brush',
    patchSelection: 'Patch', redEyeTool: 'Red Eye', paintbrushTool: 'Brush', pencilTool: 'Pencil',
    colorReplacementBrushTool: 'Color Replacement', cloneStampTool: 'Clone Stamp', historyBrushTool: 'History Brush',
    eraserTool: 'Eraser', backgroundEraserTool: 'Eraser', magicEraserTool: 'Eraser', gradientTool: 'Gradient',
    bucketTool: 'Paint Bucket', blurTool: 'Blur', sharpenTool: 'Sharpen', smudgeTool: 'Smudge',
    dodgeTool: 'Dodge', burnInTool: 'Burn', saturationTool: 'Sponge', penTool: 'Pen', freeformPenTool: 'Pen',
    curvaturePenTool: 'Pen', typeCreateOrEditTool: 'Type', typeVerticalCreateOrEditTool: 'Type',
    pathComponentSelectTool: 'Path Selection', directSelectTool: 'Direct Selection', rectangleTool: 'Shapes',
    ellipseTool: 'Shapes', polygonTool: 'Shapes', lineTool: 'Shapes', customShapeTool: 'Shapes',
    handTool: 'Hand', zoomTool: 'Zoom', rotateTool: 'Rotate View', frameTool: 'Frame', objectSelectTool: 'Object Selection'
  };
  function toolName(t) {
    t = String(t || '');
    if (PS_TOOLS[t]) return PS_TOOLS[t];
    t = t.replace(/Tool$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  var PS_MODES = { 'DocumentMode.RGB': 'RGB', 'DocumentMode.CMYK': 'CMYK', 'DocumentMode.GRAYSCALE': 'Grayscale',
    'DocumentMode.LAB': 'Lab', 'DocumentMode.BITMAP': 'Bitmap', 'DocumentMode.INDEXEDCOLOR': 'Indexed',
    'DocumentMode.MULTICHANNEL': 'Multichannel', 'DocumentMode.DUOTONE': 'Duotone' };

  function photoshop() {
    var o = { host: 'PHXS', hasProject: false };
    try { o.version = String(app.version); } catch (e) {}
    var n = 0;
    try { n = app.documents.length; } catch (e) { return { error: 'busy' }; }
    if (!n) return o;
    var d;
    try { d = app.activeDocument; } catch (e) { return { error: 'busy' }; } // modal dialog open
    o.hasProject = true;
    o.docs = n;
    try { o.project = o.document = stripExt(d.name); } catch (e) {}
    try { o.width = Math.round(d.width.as('px')); o.height = Math.round(d.height.as('px')); } catch (e) {}
    try { o.dpi = Math.round(d.resolution); } catch (e) {}
    try { o.layers = d.layers.length; } catch (e) {}
    try { o.colorMode = PS_MODES[String(d.mode)] || String(d.mode).replace('DocumentMode.', ''); } catch (e) {}
    try { o.history = d.historyStates.length; o.historyState = String(d.activeHistoryState.name); } catch (e) {}
    try { o.tool = toolName(app.currentTool); } catch (e) {}
    try { o.saved = !!d.saved; } catch (e) {}
    try { o.path = String(d.fullName.fsName); } catch (e) {} // throws for unsaved docs
    return o;
  }

  // ---- Illustrator ---------------------------------------------------------
  function illustrator() {
    var o = { host: 'ILST', hasProject: false };
    try { o.version = String(app.version); } catch (e) {}
    var n = 0;
    try { n = app.documents.length; } catch (e) { return { error: 'busy' }; }
    if (!n) return o;
    var d;
    try { d = app.activeDocument; } catch (e) { return { error: 'busy' }; }
    o.hasProject = true;
    o.docs = n;
    try { o.project = o.document = stripExt(d.name); } catch (e) {}
    try {
      o.artboards = d.artboards.length;
      var idx = d.artboards.getActiveArtboardIndex();
      var ab = d.artboards[idx];
      o.artboard = String(ab.name);
      o.artboardIndex = idx + 1;
      var r = ab.artboardRect; // [left, top, right, bottom] in points
      o.width = Math.round(r[2] - r[0]);
      o.height = Math.round(r[1] - r[3]);
    } catch (e) {}
    try { o.layers = d.layers.length; } catch (e) {}
    try { o.objects = d.pageItems.length; } catch (e) {}
    try { o.colorMode = d.documentColorSpace == DocumentColorSpace.CMYK ? 'CMYK' : 'RGB'; } catch (e) {}
    try { o.saved = !!d.saved; } catch (e) {}
    try { if (d.fullName && d.path && String(d.path) !== '') o.path = String(d.fullName.fsName); } catch (e) {}
    return o;
  }

  // ---- Audition (its scripting DOM is thin, so everything is best-effort) --
  function audition() {
    var o = { host: 'AUDT', hasProject: false };
    try { o.version = String(app.version); } catch (e) {}
    var d = null;
    try { d = app.activeDocument; } catch (e) {}
    if (!d) return o;
    o.hasProject = true;
    var name = '';
    try { name = d.displayName || d.name || ''; } catch (e) {}
    if (!name) { try { name = baseName(d.path || d.filePath || ''); } catch (e) {} }
    o.project = o.document = stripExt(name || 'Untitled');
    var cls = '';
    try { cls = d.reflect.name; } catch (e) {}
    if (/multitrack/i.test(cls)) o.docType = 'Multitrack session';
    else if (/wave|audio/i.test(cls)) o.docType = 'Waveform';
    try { if (d.sampleRate) o.sampleRateHz = Number(d.sampleRate); } catch (e) {}
    try { if (d.tracks && d.tracks.length !== undefined) o.tracks = d.tracks.length; } catch (e) {}
    try { var p = d.path || d.filePath; if (p) o.path = String(p); } catch (e) {}
    return o;
  }

  // ---- Media Encoder: listen to queue events, report the latest state ------
  var ame = { hooked: false, progress: 0, source: '', output: '', started: 0, done: 0, failed: 0 };
  function hookAme() {
    if (ame.hooked) return;
    ame.hooked = true;
    var eh = app.getEncoderHost();
    var on = function (name, fn) { try { eh.addEventListener(name, fn, false); } catch (e) {} };
    on('onItemEncodingStarted', function (e) {
      ame.progress = 0;
      ame.started = new Date().getTime();
      try { ame.source = String(e.sourceFilePath || ''); ame.output = String(e.outputFilePath || ''); } catch (x) {}
    });
    on('onEncodingItemProgressUpdate', function (e) {
      try { ame.progress = Number(e.progress) || 0; } catch (x) {}
      try { if (e.sourceFilePath) ame.source = String(e.sourceFilePath); if (e.outputFilePath) ame.output = String(e.outputFilePath); } catch (x) {}
      if (!ame.started) ame.started = new Date().getTime();
    });
    var complete = function (e) {
      var ok = true;
      try { ok = String(e.result) !== 'False'; } catch (x) {}
      if (ok) ame.done++; else ame.failed++;
      ame.progress = 0;
      ame.started = 0;
    };
    on('onItemEncodeComplete', complete);
    on('onItemEncodeCompleted', complete);
  }
  function mediaEncoder() {
    var o = { host: 'AME', hasProject: true, project: 'Media Encoder' };
    try { o.version = String(app.buildNumber || ''); } catch (e) {}
    try { hookAme(); } catch (e) {}
    var running = false, status = '';
    try {
      var eh = app.getEncoderHost();
      try { status = String(eh.getBatchEncoderStatus()); } catch (e) {}
      running = status ? status === 'running' : !!eh.isBatchRunning();
    } catch (e) {}
    o.rendering = running;
    o.queueStatus = status;
    o.done = ame.done;
    o.failed = ame.failed;
    if (running) {
      o.progress = ame.progress;
      o.itemStarted = ame.started || 0;
      o.file = stripExt(baseName(ame.source || ame.output));
      o.output = baseName(ame.output);
    }
    return o;
  }

  // Start listening to Media Encoder's queue as soon as this script loads.
  try { if (BridgeTalk.appName === 'ame') hookAme(); } catch (e) {}

  return {
    getInfo: function (host) {
      var info;
      try {
        if (!host) host = BridgeTalk.appName === 'aftereffects' ? 'AEFT' : 'PPRO';
        if (host === 'AEFT') info = afterEffects();
        else if (host === 'PHXS' || host === 'PHSP') info = photoshop();
        else if (host === 'ILST') info = illustrator();
        else if (host === 'AUDT') info = audition();
        else if (host === 'AME') info = mediaEncoder();
        else info = premiere();
      } catch (e) {
        info = { error: String(e) };
      }
      return toJSON(info);
    },
    // Cheap call used ~1/s to detect timeline playback (Premiere Pro).
    playhead: function () {
      try {
        var s = app.project.activeSequence;
        if (!s) return '';
        var id = '';
        try { id = String(s.sequenceID); } catch (e) { id = String(s.name); }
        return id + '|' + (Number(s.getPlayerPosition().ticks) / TICKS) + '|' + (Number(s.end) / TICKS);
      } catch (e) { return ''; }
    },
    ping: function () { return 'pong'; },
    toJSON: toJSON
  };
})();
