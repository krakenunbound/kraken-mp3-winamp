const { applyThemePayload } = require('./uiThemes');

function installThemeListener(ipcRenderer) {
    ipcRenderer.on('kraken:theme:apply', (_event, payload) => {
        applyThemePayload(document, payload);
        if (typeof window.onKrakenThemeApplied === 'function') {
            window.onKrakenThemeApplied(payload);
        }
    });
}

module.exports = { installThemeListener };
