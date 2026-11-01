const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('envelopeDesktop', {
  saveFile: (name, content) => ipcRenderer.invoke('save-file', { name, content }),
  openFile: () => ipcRenderer.invoke('open-file'),
  loadAuto: () => ipcRenderer.invoke('load-auto'),
  saveAuto: (content) => ipcRenderer.invoke('save-auto', content),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  printDocument: (options) => ipcRenderer.invoke('print-document', options),
})
