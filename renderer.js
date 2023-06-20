const { ipcRenderer, dialog } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const createRepoSelectBtn = document.getElementById('create-repo-select');
  const createRepoBtn = document.getElementById('create-repo-create');
  
  createRepoSelectBtn.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-folder-dialog');
    try {
      document.getElementById('create-repo-path').textContent = result.filePaths[0];
    } catch (error) {
      document.getElementById('create-repo-path').textContent = '';
    }
  });

  createRepoBtn.addEventListener('click', async () => {
    const path = document.getElementById('create-repo-path').textContent;
    const name = document.getElementById('create-repo-name').value;

    if (path && name) {
      ipcRenderer.send('create-repo', { path, name });
    } else if (!path) {
      ipcRenderer.send('no-path');
    } else if (!name) {
      ipcRenderer.send('no-friendly-name');
    }
  });
});