/*
* File Name: index.js
* Date Created: 2023-06-08
* Last Modified: 2023-07-16
* Purpose: 
* Inputs:
* Outputs:
*/

const { app, BrowserWindow, ipcMain } = require('electron');
const { createWindow } = require('./helpers/createWindow.js');
const {
  handleOpenFolderDialog, 
  handleCreateRepo, 
  handleGetActiveRepoCloud, 
  handleGetActiveRepoLocal, 
  handleSetActiveRepo, 
  handleGetLocalRepos, 
  handleGetCloudRepos, 
  handleCloneRepo, 
  handlePullRepo, 
  handleCloneLocalRepo, 
  handleCheckLocalDirectory, 
  handlePushChanges 
} = require('./ipc/ipcMain.js');

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) 
      createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-folder-dialog', handleOpenFolderDialog);
ipcMain.on('create-repo', handleCreateRepo);
ipcMain.handle('get-active-repo-cloud', handleGetActiveRepoCloud);
ipcMain.handle('get-active-repo-local', handleGetActiveRepoLocal);
ipcMain.handle('set-active-repo', handleSetActiveRepo);
ipcMain.handle('get-local-repos', handleGetLocalRepos);
ipcMain.handle('get-cloud-repos', handleGetCloudRepos);
ipcMain.handle('clone-repo', handleCloneRepo);
ipcMain.handle('pull-repo', handlePullRepo);
ipcMain.handle('clone-local-repo', handleCloneLocalRepo);
ipcMain.handle('check-local-directory', handleCheckLocalDirectory);
ipcMain.handle('push-changes', handlePushChanges);