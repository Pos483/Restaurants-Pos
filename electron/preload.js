const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  switchProfile: (profile) => ipcRenderer.send('switch-profile', profile),
  getNativeTheme: () => ipcRenderer.invoke('get-native-theme'),
  onThemeChanged: (callback) => {
    const subscription = (event, theme) => callback(theme);
    ipcRenderer.on('native-theme-changed', subscription);
    return () => ipcRenderer.removeListener('native-theme-changed', subscription);
  },
  onUpdateChecking: (callback) => {
    ipcRenderer.on('update-checking', callback);
    return () => ipcRenderer.removeListener('update-checking', callback);
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', callback);
    return () => ipcRenderer.removeListener('update-available', callback);
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on('update-not-available', callback);
    return () => ipcRenderer.removeListener('update-not-available', callback);
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', callback);
    return () => ipcRenderer.removeListener('update-download-progress', callback);
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', callback);
    return () => ipcRenderer.removeListener('update-downloaded', callback);
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', callback);
    return () => ipcRenderer.removeListener('update-error', callback);
  },
  removeListeners: (channel) => ipcRenderer.removeAllListeners(channel),

});

contextBridge.exposeInMainWorld('electron', {
  onThemeChanged: (callback) => {
    const subscription = (event, theme) => callback(theme);
    ipcRenderer.on('native-theme-changed', subscription);
    return () => ipcRenderer.removeListener('native-theme-changed', subscription);
  }
});
