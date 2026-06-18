const { contextBridge } = require('electron')

// Minimal, safe bridge. The renderer is a self-contained web app and needs no
// Node access; this just lets it know it's running inside the desktop shell.
contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
})
