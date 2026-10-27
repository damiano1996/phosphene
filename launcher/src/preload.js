const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('phosphene', {
  status: () => ipcRenderer.invoke('status'),
  install: () => ipcRenderer.invoke('install'),
  launch: () => ipcRenderer.invoke('launch'),
  stop: () => ipcRenderer.invoke('stop'),
  open: () => ipcRenderer.invoke('open'),
  onLog: f => ipcRenderer.on('log', (_, l) => f(l)),
  onStatus: f => ipcRenderer.on('status', (_, s) => f(s)),
})
