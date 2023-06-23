const { ipcRenderer, ipcMain } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const org = document.getElementById('organization');

  const selectRepoBtn = document.getElementById('repo-select-btn');

  const selectDirBtn = document.getElementById('select-dir-btn');
  const selectDirBtn2 = document.getElementById('select-dir-btn2');
  const selectDirBtn3 = document.getElementById('select-dir-btn3');

  const createRepoPathLabel = document.getElementById('create-repo-path');
  const createRepoCreateBtn = document.getElementById('create-repo-create');

  const changeRepoSelect = document.getElementById('change-repo-select');
  const changeRepoSelectBtn = document.getElementById('change-repo-select-btn');

  const cloneRepoCloudSelect = document.getElementById('clone-repo-cloud-select');
  const cloneRepoCloudBtn = document.getElementById('clone-repo-cloud-btn');

  const pushBtn = document.getElementById('push-btn');
  const pullBtn = document.getElementById('pull-btn');

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
        document.getElementById('clone-repo-cloud-path').textContent = folderPath;
        document.getElementById('clone-repo-cloud-btn').removeAttribute('disabled', 'disabled');
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

  pullBtn.addEventListener('click', () => {
    ipcRenderer.invoke('pull-repo').then(() => {
      alert('pull complete');
    });
  });

  createRepoCreateBtn.addEventListener('click', () => { 
    const friendlyName = document.getElementById('create-repo-name').value;
    const folderPath = createRepoPathLabel.innerText + '\\' + friendlyName;
    const organization = document.getElementById('organization').value;

    const repoData = {
      folderPath,
      friendlyName,
      organization
    };

    ipcRenderer.send('create-repo', repoData);
    document.getElementById('active-repo').innerText = friendlyName;
    pullBtn.removeAttribute('disabled', 'disabled');
    pushBtn.removeAttribute('disabled', 'disabled');
  });

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

      ipcRenderer.invoke('get-cloud-repos').then((repos) => {
        const orgRepos = repos.filter((repo) => repo.organization === org.value);
        cloneRepoCloudSelect.innerHTML = '';
        
        orgRepos.forEach((repo) => {
          console.log(repo);
          const option = document.createElement('option');
          option.value = repo.id;
          option.innerText = repo.friendlyName + ' - ' + repo.organization;
          cloneRepoCloudSelect.appendChild(option);
        });
      });

    } else if (val == 3) {
      createDiv.setAttribute("hidden", "hidden");
      cloneDiv.setAttribute("hidden", "hidden");
      pushDiv.removeAttribute("hidden", "hidden");
    }
  });

  cloneRepoCloudBtn.addEventListener('click', () => {
    const repoUniqueName = cloneRepoCloudSelect.options[cloneRepoCloudSelect.selectedIndex].value;
    const folderPathWithoutFName = document.getElementById('clone-repo-cloud-path').textContent + '\\';
    ipcRenderer.invoke('clone-repo', repoUniqueName, folderPathWithoutFName);
    pullBtn.removeAttribute('disabled', 'disabled');
    pushBtn.removeAttribute('disabled', 'disabled');
  });


  //for debug purposes only
  const clearJSONBtn = document.getElementById('clear-json');
  clearJSONBtn.addEventListener('click', () => {
    ipcRenderer.send('clear-json');
  });
});