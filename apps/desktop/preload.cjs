const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kiwi", {
  ask: (question) => ipcRenderer.invoke("ask", question),
  talkStart: () => ipcRenderer.invoke("talk-start"),
  talkStop: () => ipcRenderer.invoke("talk-stop"),
  talkCancel: () => ipcRenderer.invoke("talk-cancel"),
  audio: (bytes) => ipcRenderer.send("audio", bytes),
  fit: (height) => ipcRenderer.send("fit", height),
  copy: (text) => ipcRenderer.send("copy", text),
  session: () => ipcRenderer.invoke("session"),
  signIn: (email) => ipcRenderer.invoke("sign-in", email),
  signOut: () => ipcRenderer.invoke("sign-out"),
  recordStart: () => ipcRenderer.invoke("record-start"),
  recordPause: () => ipcRenderer.invoke("record-pause"),
  recordResume: () => ipcRenderer.invoke("record-resume"),
  recordStop: () => ipcRenderer.invoke("record-stop"),
  on: (channel, listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
