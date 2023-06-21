const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const createRepoSelectBtn = document.getElementById('create-repo-select');
  const createRepoPathLabel = document.getElementById('create-repo-path');
  const createRepoCreateBtn = document.getElementById('create-repo-create');

  const changeRepoSelect = document.getElementById('change-repo-select');
  const changeRepoSelectBtn = document.getElementById('change-repo-select-btn');

  ipcRenderer.invoke('get-active-repo').then((activeRepo) => {
    if (activeRepo){
      document.getElementById('active-repo').innerText = activeRepo.friendlyName + ' - ' + activeRepo.organization;
    }
  });

  ipcRenderer.invoke('get-local-repos').then((repos) => {
    changeRepoSelect.innerHTML = '';

    repos.forEach((repo) => {
      const option = document.createElement('option');
      option.value = repo.uniqueName;
      option.innerText = repo.friendlyName + ' - ' + repo.organization;
      changeRepoSelect.appendChild(option);
    });
  });

  changeRepoSelectBtn.addEventListener('click', () => {
    const activeRepo = changeRepoSelect.options[changeRepoSelect.selectedIndex].value;
    ipcRenderer.invoke('set-active-repo', activeRepo);
    document.getElementById('active-repo').innerText = changeRepoSelect.options[changeRepoSelect.selectedIndex].innerText;;
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
    document.getElementById('active-repo').innerText = friendlyName;
  });

  //for debug purposes only
  const clearJSONBtn = document.getElementById('clear-json');
  clearJSONBtn.addEventListener('click', () => {
    ipcRenderer.send('clear-json');
  });

});
