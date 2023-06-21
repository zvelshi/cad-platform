const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const createRepoSelectBtn = document.getElementById('create-repo-select');
  const createRepoPathLabel = document.getElementById('create-repo-path');
  const createRepoCreateBtn = document.getElementById('create-repo-create');

  ipcRenderer.invoke('get-active-repo').then((activeRepo) => {
    if (activeRepo){
      document.getElementById('active-repo').innerText = activeRepo.friendlyName;
    }
  });

  createRepoSelectBtn.addEventListener('click', () => {
    ipcRenderer.invoke('open-folder-dialog').then((folderPath) => {
      if (folderPath) {
        createRepoPathLabel.innerText = folderPath;
      }
    });
  });

  createRepoCreateBtn.addEventListener('click', () => { 
    const friendlyName = document.getElementById('create-repo-name').value;
    const folderPath = createRepoPathLabel.innerText + '\\' + friendlyName;
    const organization = document.getElementById('organization').value.toLowerCase();

    const repoData = {
      folderPath,
      friendlyName,
      organization
    };

    ipcRenderer.send('create-repo', repoData);
  });


  //for debug purposes only
  const clearJSONBtn = document.getElementById('clear-json');
  clearJSONBtn.addEventListener('click', () => {
    ipcRenderer.send('clear-json');
  });

});
