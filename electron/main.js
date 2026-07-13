const { app, protocol, net, BrowserWindow, dialog, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
// WhatsApp Server dependencies removed



// Register 'app' scheme as privileged to solve Dexie/IndexedDB origin security without disabling web security
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true
    }
  }
]);

// Configure logging for auto-updater
log.transports.file.level = 'info';
autoUpdater.logger = log;
// Enable experimental Web Platform features (e.g., Web Serial API)
app.commandLine.appendSwitch('enable-experimental-web-platform-features');
// Fix Supabase LockManager issue in Electron (Navigator LockManager null lock)
app.commandLine.appendSwitch('enable-features', 'WebLocks');

let mainWindow;

const profileConfigFile = path.join(app.getPath('userData'), 'active_profile.json');
let profileName = 'profile-fix-v6';

// Bypass old potentially locked active_profile.json to ensure instant boot
try {
  fs.writeFileSync(profileConfigFile, JSON.stringify({ profile: profileName }));
} catch (e) {
  console.error('Error writing profile config:', e);
}

app.setPath('userData', path.join(app.getPath('userData'), profileName));

// Window state manager
const windowStateFile = path.join(app.getPath('userData'), 'window_state.json');
let windowState = {
  width: 1200,
  height: 800,
  isMaximized: false
};

try {
  if (fs.existsSync(windowStateFile)) {
    windowState = JSON.parse(fs.readFileSync(windowStateFile, 'utf-8'));
  }
} catch (e) {
  console.error('Error reading window state:', e);
}

function saveWindowState() {
  try {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    const isMaximized = mainWindow.isMaximized();
    
    if (!isMaximized) {
      windowState.width = bounds.width;
      windowState.height = bounds.height;
    }
    windowState.isMaximized = isMaximized;
    
    fs.writeFileSync(windowStateFile, JSON.stringify(windowState));
  } catch (e) {
    console.error('Error writing window state:', e);
  }
}

ipcMain.on('switch-profile', (event, newProfile) => {
  fs.writeFileSync(profileConfigFile, JSON.stringify({ profile: newProfile }));
  app.relaunch();
  app.exit();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: windowState.width || 1200,
    height: windowState.height || 800,
    show: false, // Hide window initially to prevent blank white screen
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0B0F19' : '#FAFBFC',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../build/icon.png')
  });

  mainWindow.once('ready-to-show', () => {
    if (windowState.isMaximized) {
      mainWindow.maximize();
    } else {
      mainWindow.show();
    }
    mainWindow.focus();
  });

  // Listen to OS native theme changes and broadcast to renderer
  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('native-theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    }
  });

  mainWindow.on('close', () => {
    saveWindowState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Redirect renderer console messages to electron-log
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['debug', 'info', 'warn', 'error'];
    const lvl = levels[level] || 'info';
    log[lvl](`[Renderer] ${message} (${path.basename(sourceId)}:${line})`);
  });

  // Check if we are in development mode
  const isDev = !app.isPackaged;

    if (isDev) {
      mainWindow.loadURL('http://localhost:5173');
      mainWindow.webContents.openDevTools();
    } else {
      mainWindow.loadURL('app://localhost');
    }

    // Auto-select serial port for thermal printer or ask user if multiple
    mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
      event.preventDefault();
      if (portList && portList.length > 0) {
        if (portList.length === 1) {
          callback(portList[0].portId);
        } else {
          const { dialog } = require('electron');
          const options = {
            type: 'question',
            buttons: portList.map(p => p.displayName ? `${p.portName} - ${p.displayName}` : p.portName).concat(['Cancel']),
            defaultId: 0,
            title: 'Select Printer Port',
            message: 'Multiple COM ports detected. Please select your Thermal Printer port:',
          };
          
          dialog.showMessageBox(mainWindow, options).then(result => {
            if (result.response < portList.length) {
              callback(portList[result.response].portId);
            } else {
              callback('');
            }
          }).catch(err => {
            console.log(err);
            callback('');
          });
        }
      } else {
        const { dialog } = require('electron');
        dialog.showErrorBox('No COM Ports Found', 'Koi bhi COM port detect nahi hua. Kripya check karein ki printer connect hai aur uske Virtual COM (VCP) drivers install hain ya nahi.');
        callback(''); // No ports found
      }
    });

    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
      if (permission === 'serial') {
        return true;
      }
      return false;
    });

    mainWindow.webContents.session.setDevicePermissionHandler((details) => {
      if (details.deviceType === 'serial') {
        return true;
      }
      return false;
    });
  }

app.whenReady().then(() => {
  // Register custom protocol handler for 'app://' to serve packaged files securely
  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      let filePath = path.join(__dirname, '..', 'dist', url.pathname);
      filePath = path.normalize(filePath);

      // Prevent directory traversal attacks
      const distPath = path.normalize(path.join(__dirname, '..', 'dist'));
      if (!filePath.startsWith(distPath)) {
        return new Response('Access Denied', { status: 403 });
      }

      // NOTE: When asar: true, dist/ files are inside the asar archive.
      // fs.existsSync / fs.statSync do NOT work reliably on asar-packed files.
      // Instead we attempt to serve the requested file; on failure (e.g. directory
      // or missing asset), we fall back to index.html for SPA client-side routing.
      return net.fetch(`file://${filePath}`).catch(() => {
        const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
        return net.fetch(`file://${indexPath}`);
      });
    } catch (err) {
      log.error('[Protocol Handle] Error:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  });

  createWindow();




  // Check for updates when app is packaged
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// IPC for App Version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// IPC for Native Theme query
ipcMain.handle('get-native-theme', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

// IPC for Manual Update Check
ipcMain.on('check-for-updates', () => {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  } else {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-not-available');
  }
});

ipcMain.on('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

// Auto-Updater Event Listeners
autoUpdater.on('checking-for-update', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-checking');
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available.');
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available.');
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-not-available', info);
});

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-download-progress', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded.');
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-downloaded', info);
  
  const dialogOpts = {
    type: 'info',
    buttons: ['Restart', 'Later'],
    title: 'Application Update',
    message: info.version,
    detail: 'A new version has been downloaded. Restart the application to apply the updates.'
  };

  const parentWin = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null;
  dialog.showMessageBox(parentWin, dialogOpts).then((returnValue) => {
    if (returnValue.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater. ' + err);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-error', err.message);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // WhatsApp Server shutdown call removed
});

