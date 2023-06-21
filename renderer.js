const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const selectDirBtn = document.getElementById('select-dir-btn');
  const selectDirBtn2 = document.getElementById('select-dir-btn2');
  const selectDirBtn3 = document.getElementById('select-dir-btn3');

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

  selectDirBtn.addEventListener('click', () => {
    ipcRenderer.invoke('open-folder-dialog').then((folderPath) => {
      if (folderPath) {
        createRepoPathLabel.innerText = folderPath;
      }
    });
  });

  selectDirBtn2.addEventListener('click', () => {
    ipcRenderer.invoke('open-folder-dialog').then((folderPath) => {
      if (folderPath) {
        //do something with this folder
      }
    });
  });

  selectDirBtn3.addEventListener('click', () => {
    ipcRenderer.invoke('open-folder-dialog').then((folderPath) => {
      if (folderPath) {
        //do something with this folder
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
  const selectRepoBtn = document.getElementById('repo-select-btn');
  selectRepoBtn.addEventListener('click', () => {
    const val = document.getElementById('repo-select').value;
    
    let createDiv = document.getElementById('create');
    let cloneDiv = document.getElementById('clone');
    let pushDiv = document.getElementById('push-clone');

    if (val == 1){
      createDiv.removeAttribute("hidden", "hidden");
      cloneDiv.setAttribute("hidden", "hidden");
      pushDiv.setAttribute("hidden", "hidden");;
    } else if (val == 2) {
      createDiv.setAttribute("hidden", "hidden");
      cloneDiv.removeAttribute("hidden", "hidden");
      pushDiv.setAttribute("hidden", "hidden");
    } else if (val == 3) {
      createDiv.setAttribute("hidden", "hidden");
      cloneDiv.setAttribute("hidden", "hidden");
      pushDiv.removeAttribute("hidden", "hidden");
    }
  });

  const clearJSONBtn = document.getElementById('clear-json');
  clearJSONBtn.addEventListener('click', () => {
    ipcRenderer.send('clear-json');
  });

});