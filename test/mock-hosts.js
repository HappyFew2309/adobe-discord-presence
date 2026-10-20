// Loads host.jsx in Node with fake Premiere Pro / After Effects object models.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'jsx', 'host.jsx'), 'utf8');
const T = 254016000000;

function premiereApp(state) {
  const track = (n) => ({ clips: { numItems: n } });
  const vt = [track(12), track(4), track(0)]; vt.numTracks = 3;
  const at = [track(9), track(2)]; at.numTracks = 2;
  const seq = {
    name: 'Main Edit v3', frameSizeHorizontal: 3840, frameSizeVertical: 2160,
    timebase: String(T / 23.976), end: String(T * 754), videoTracks: vt, audioTracks: at,
    getPlayerPosition: () => ({ ticks: String(T * state.playhead), seconds: state.playhead }),
    getSelection: () => [1, 2]
  };
  return {
    version: '25.1.0',
    projects: { numProjects: state.noProject ? 0 : 1 },
    project: state.noProject ? null : {
      name: 'Summer "Trip" Vlog.prproj', path: 'C:\\Videos\\Summer Trip Vlog.prproj',
      sequences: { numSequences: 4 }, rootItem: { children: { numItems: 37 } },
      activeSequence: state.noSequence ? null : seq
    }
  };
}

function aeContext(state) {
  function CompItem(o) { Object.assign(this, o); }
  function FootageItem(o) { Object.assign(this, o); }
  const comp = new CompItem({ name: 'Logo Reveal', width: 1080, height: 1920, frameRate: 29.97, duration: 12.5, time: state.time || 3.2, numLayers: 14, selectedLayers: [1] });
  const items = [comp, new CompItem({ name: 'Precomp 1' }), new FootageItem({ name: 'bg.mp4' })];
  const RQItemStatus = { QUEUED: 3013, RENDERING: 3015, DONE: 3016 };
  const rqItems = state.rendering
    ? [{ status: RQItemStatus.RENDERING, comp }, { status: RQItemStatus.QUEUED, comp }, { status: RQItemStatus.QUEUED, comp }]
    : [];
  return {
    CompItem, FootageItem, RQItemStatus,
    app: {
      version: '25.2x24',
      project: {
        numItems: state.empty ? 0 : items.length,
        file: state.empty ? null : { name: 'Brand%20Kit%202026.aep' },
        item: (i) => items[i - 1],
        activeItem: state.empty ? null : comp,
        renderQueue: { rendering: !!state.rendering, numItems: rqItems.length, item: (i) => rqItems[i - 1] }
      }
    }
  };
}

function psContext(state) {
  const mode = { toString: () => 'DocumentMode.RGB' };
  return { app: {
    version: '26.1.0', currentTool: state.tool || 'paintbrushTool',
    documents: { length: state.empty ? 0 : 2 },
    activeDocument: state.empty ? undefined : {
      name: 'Poster Final.psd', width: { as: () => 3000 }, height: { as: () => 4000 }, resolution: 300,
      layers: { length: 23 }, mode, historyStates: { length: state.history || 41 }, activeHistoryState: { name: 'Brush Tool' },
      saved: false, fullName: { fsName: 'D:\\Work\\Clients\\Acme\\Poster Final.psd' }
    }
  } };
}

function aiContext(state) {
  const abs = [{ name: 'Instagram Post', artboardRect: [0, 1080, 1080, 0] }, { name: 'Story', artboardRect: [0, 1920, 1080, 0] }];
  abs.getActiveArtboardIndex = () => 0;
  return { DocumentColorSpace: { CMYK: 'CMYK', RGB: 'RGB' }, app: {
    version: '29.2.1', documents: { length: 1 },
    activeDocument: { name: 'Brand Icons.ai', artboards: abs, layers: { length: 4 }, pageItems: { length: 312 },
      documentColorSpace: 'RGB', saved: true, path: 'C:\\Design', fullName: { fsName: 'C:\\Design\\Brand Icons.ai' } }
  } };
}

function auContext() {
  return { app: { version: '25.0', activeDocument: { displayName: 'Podcast Ep 12.sesx', sampleRate: 48000,
    tracks: { length: 6 }, reflect: { name: 'MultitrackDocument' }, path: 'C:\\Audio\\Podcast Ep 12.sesx' } } };
}

function ameContext(state) {
  const handlers = {};
  const eh = {
    addEventListener: (n, fn) => { handlers[n] = fn; },
    getBatchEncoderStatus: () => state.status || 'stopped',
    isBatchRunning: () => state.status === 'running'
  };
  return { app: { buildNumber: '25.0.0', getEncoderHost: () => eh }, __fire: (n, e) => handlers[n] && handlers[n](e) };
}

function load(host, state) {
  const make = { PPRO: (s) => ({ app: premiereApp(s) }), AEFT: aeContext, PHXS: psContext, ILST: aiContext, AUDT: auContext, AME: ameContext };
  const ctx = make[host](state);
  ctx.BridgeTalk = { appName: { PPRO: 'premierepro', AEFT: 'aftereffects', PHXS: 'photoshop', ILST: 'illustrator', AUDT: 'audition', AME: 'ame' }[host] };
  ctx.decodeURI = decodeURI;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return {
    ctx,
    getInfo: () => vm.runInContext('DiscordPresenceHost.getInfo("' + host + '")', ctx),
    playhead: () => vm.runInContext('DiscordPresenceHost.playhead()', ctx)
  };
}

module.exports = { load };
