const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const chokidar = require('chokidar');

let mainWindow;
let watcher;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 1050,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  mainWindow.loadFile('index.html')

  ipcMain.handle('open-folder-dialog', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
  
    if (!result.canceled) {
      const selectedFolderPath = result.filePaths[0];
  
      // Make sure to set the global.folderPath to selectedFolderPath
      global.folderPath = selectedFolderPath;

      if (watcher) {
        watcher.close();
      }

      watcher = chokidar.watch(global.folderPath, {
        ignoreInitial: true,
        events: ['add', 'change', 'unlink'] // Include 'add' event
      });

      watcher.on('all', (event, filePath) => {
        mainWindow.webContents.send('file-changed', filePath, event);
      });

        const hierarchy = await getFolderHierarchy(global.folderPath);
      return hierarchy;
    } else {
      global.folderPath = '';
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    }

    return [];
  });

  ipcMain.handle('get-folder-hierarchy', async () => {
    if (global.folderPath) {
      try {
        const hierarchy = await getFolderHierarchy(global.folderPath);
        return hierarchy;
      } catch (error) {
        console.error('Error reading folder hierarchy:', error);
      }
    }

    return [];
  });
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {

    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})


async function getFolderHierarchy(folderPath) {
  const stats = await fs.lstat(folderPath);
  const hierarchy = {
    name: path.basename(folderPath),
    path: folderPath,
    type: stats.isDirectory() ? 'folder' : 'file',
    isModified: false,
  };

  if (stats.isDirectory()) {
    const children = await fs.readdir(folderPath);
    hierarchy.children = await Promise.all(children.map(async (child) => {
      const childPath = path.join(folderPath, child);
      return getFolderHierarchy(childPath);
    }));
  }

  return hierarchy;
}