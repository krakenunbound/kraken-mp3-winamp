const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let currentFiles = [];

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        // Someone tried to run a second instance, focus our window and handle the file
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();

            // Get file from command line (last argument that's a file)
            const filePath = commandLine.find(arg => isAudioFile(arg));
            if (filePath) {
                mainWindow.webContents.send('file-opened', filePath);
            }
        }
    });
}

function isAudioFile(filePath) {
    const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus'];
    const ext = path.extname(filePath).toLowerCase();
    return audioExtensions.includes(ext);
}

function createWindow() {
    // Winamp-style: fixed width, flexible height for panel stacking
    const windowWidth = 500;
    const windowHeight = 640;

    mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        minWidth: 500,
        minHeight: 145,
        maxWidth: 600,
        maxHeight: 1000,
        frame: false,
        transparent: false,
        resizable: true,
        backgroundColor: '#0a1018',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        icon: path.join(__dirname, '../assets/icons/icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Remove default menu
    Menu.setApplicationMenu(null);

    // Handle file passed via command line on startup
    const filePath = process.argv.find(arg => isAudioFile(arg));
    if (filePath) {
        mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.send('file-opened', filePath);
        });
    }

    // Dev tools - press F12 to toggle
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
            mainWindow.webContents.toggleDevTools();
        }
    });
}

// IPC Handlers
ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'opus'] }
        ]
    });
    return result.filePaths;
});

ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (result.filePaths.length > 0) {
        const folderPath = result.filePaths[0];
        const files = await scanFolderForAudio(folderPath);
        return files;
    }
    return [];
});

async function scanFolderForAudio(folderPath) {
    const audioFiles = [];
    const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus'];

    function scanDir(dir) {
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    scanDir(fullPath);
                } else if (stat.isFile()) {
                    const ext = path.extname(item).toLowerCase();
                    if (audioExtensions.includes(ext)) {
                        audioFiles.push(fullPath);
                    }
                }
            }
        } catch (err) {
            console.error('Error scanning directory:', err);
        }
    }

    scanDir(folderPath);
    return audioFiles;
}

ipcMain.handle('get-backgrounds-path', () => {
    const documentsPath = app.getPath('documents');
    const bgPath = path.join(documentsPath, 'Kraken MP3', 'Wallpapers');

    // Create directory if it doesn't exist
    if (!fs.existsSync(bgPath)) {
        try {
            fs.mkdirSync(bgPath, { recursive: true });
        } catch (err) {
            console.error('Failed to create wallpaper directory:', err);
        }
    }

    return bgPath;
});

ipcMain.handle('list-backgrounds', async (event, bgPath) => {
    try {
        const files = fs.readdirSync(bgPath);
        return files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
    } catch (err) {
        console.error('Error listing backgrounds:', err);
        return [];
    }
});

ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
});

ipcMain.on('close-window', () => {
    mainWindow.close();
});

ipcMain.on('toggle-always-on-top', (event, value) => {
    if (value) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
    } else {
        mainWindow.setAlwaysOnTop(false, 'normal');
    }
});

// App lifecycle
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle app being opened with a file (macOS)
app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) {
        mainWindow.webContents.send('file-opened', filePath);
    }
});
