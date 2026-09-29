/* Midnight Airmail — boot. Loads settings, builds the static UI, then resumes a saved run (or a
   hot-reload snapshot) straight away, or shows the title screen. */
(function (root) {
  'use strict';
  var MA = root.MA, ui = MA.ui;

  function start(data) {
    data = data || {};
    ui.loadSettings(data.settings || null);
    if (data.skipped) ui.skipped = data.skipped;
    ui.init();
    ui.applyAudio();
    var saved = null;
    if (data.save) { try { saved = MA.run.deserialize(data.save); } catch (e) { saved = null; } }
    if (!saved) { try { saved = ui.loadSave(); } catch (e2) { saved = null; } }
    if (saved) {
      try {
        ui.enterGame(saved, { instant: true });
        if (saved.phase !== 'gameover' && saved.phase !== 'victory') ui.toast('Welcome back. Your run is just as you left it.');
        return;
      } catch (err) {
        if (root.console) root.console.error(err);
        ui.clearSave();
        ui.state = null;
      }
    }
    ui.showTitle();
  }

  var claude = root.claude;
  if (claude && claude.hot && claude.hot.snapshot) {
    claude.hot.snapshot(function () {
      return { save: ui.serializedState(), settings: ui.settings, skipped: ui.skipped };
    });
  }
  var hot = claude && claude.hot;
  if (hot && hot.ready) hot.ready(start);
  else start((hot && hot.data) || {});
})(typeof window !== 'undefined' ? window : globalThis);
