const { contextBridge, ipcRenderer, webUtils } = require('electron');



contextBridge.exposeInMainWorld('kraken', {

    ping: () => ipcRenderer.invoke('kraken:ping'),

    invoke: (channel, ...args) => {

        const allowed = ['kraken:eq:get-state', 'kraken:layout:get', 'kraken:layout:reset', 'kraken:dock:get-state'];

        if (!allowed.includes(channel)) throw new Error(`IPC invoke not allowed: ${channel}`);

        return ipcRenderer.invoke(channel, ...args);

    },

    send: (channel, payload) => {

        const allowed = [

            'kraken:eq:set',

            'kraken:window:close-eq',

            'kraken:window:toggle-eq',

            'kraken:window:close-playlist',

            'kraken:window:drag-start',

            'kraken:window:drag-move',

            'kraken:window:drag-end',

            'kraken:dock:toggle',

            'kraken:dock:set-locked',

            'kraken:playlist:action',

            'kraken:playlist:state',

            'kraken:playlist:request-sync',

            'kraken:theme:request-sync'

        ];

        if (!allowed.includes(channel)) throw new Error(`IPC send not allowed: ${channel}`);

        ipcRenderer.send(channel, payload);

    },

    resolveDropPaths: (files) => {
        if (!files || !files.length) return [];
        const paths = [];
        for (const file of files) {
            if (!file) continue;
            try {
                const p = webUtils.getPathForFile(file);
                if (p) paths.push(p);
            } catch (_) { /* skip invalid file entry */ }
        }
        return paths;
    },
    on: (channel, callback) => {

        const allowed = [

            'kraken:eq:state',

            'kraken:ping:reply',

            'kraken:dock:state',

            'kraken:dock:message',

            'kraken:playlist:state',

            'kraken:playlist:time',

            'kraken:theme:apply'

        ];

        if (!allowed.includes(channel)) throw new Error(`IPC on not allowed: ${channel}`);

        const handler = (_event, data) => callback(data);

        ipcRenderer.on(channel, handler);

        return () => ipcRenderer.removeListener(channel, handler);

    }

});

