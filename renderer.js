/*
* File Name: renderer.js
* Author: Zac Velshi
* Date Created: 2023-06-08
* Last Modified: 2023-07-08
* Purpose: This file interfaces the HTML file inputs with the Javascript DOM commmands.
*/

const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const organization = document.getElementById('organization');

  const selectRepoSelect = document.getElementById('repo-select');

  const selectDirBtn = document.getElementById('select-dir-btn');
  const selectDirBtn2 = document.getElementById('select-dir-btn2');
  const selectDirBtn3 = document.getElementById('select-dir-btn3');

  const createRepoPathLabel = document.getElementById('create-repo-path');
  const createRepoCreateBtn = document.getElementById('create-repo-create');

  const changeRepoSelect = document.getElementById('change-repo-select');

  const cloneRepoCloudSelect = document.getElementById('clone-repo-cloud-select');
  const cloneRepoCloudBtn = document.getElementById('clone-repo-cloud-btn');

  const cloneRepoLocalBtn = document.getElementById('clone-local-repo-btn');

  const pushBtn = document.getElementById('push-btn');
  const pullBtn = document.getElementById('pull-btn');

  ipcRenderer.invoke('get-active-repo-cloud').then((activeRepo) => {
    if (activeRepo){
     document.getElementById('active-repo').innerText = activeRepo.friendlyName + ' - ' + activeRepo.organization;
      organization.value = activeRepo.organization;
    } else {
      document.getElementById('active-repo').innerText = 'No active repo';
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

  changeRepoSelect.addEventListener('input', () => {
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
        document.getElementById('clone-local-repo-path').textContent = folderPath;
        document.getElementById('clone-local-repo-friendly-name').textContent = folderPath.split('\\').pop();
        document.getElementById('clone-local-repo-org').textContent = organization.value;
        cloneRepoLocalBtn.removeAttribute('disabled', 'disabled');
      }
    });
  });

  pullBtn.addEventListener('click', () => {
    ipcRenderer.invoke('pull-repo');
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
  });

  selectRepoSelect.addEventListener('input', () => {
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
        const orgRepos = repos.filter((repo) => repo.organization === organization.value);
        cloneRepoCloudSelect.innerHTML = '';
        
        orgRepos.forEach((repo) => {
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

  cloneRepoLocalBtn.addEventListener('click',  async () => {

    // get repo data
    const repoData = {
      friendlyName: document.getElementById('clone-local-repo-friendly-name').textContent,
      organization: document.getElementById('clone-local-repo-org').textContent,
      folderPath: document.getElementById('clone-local-repo-path').textContent
    };  

    // clone repo
    ipcRenderer.invoke('clone-local-repo', repoData);

    // update active repo and repo list
    ipcRenderer.invoke('get-local-repos').then((repos) => {
      changeRepoSelect.innerHTML = '';

      repos.forEach((repo) => {
        const option = document.createElement('option');
        option.value = repo.uniqueName;
        option.innerText = repo.friendlyName + ' - ' + repo.organization;
        changeRepoSelect.appendChild(option);
      });
    });
    document.getElementById('active-repo').innerText = repoData.friendlyName + ' - ' + repoData.organization;
  });

  cloneRepoCloudBtn.addEventListener('click', () => {
    const repoUniqueName = cloneRepoCloudSelect.options[cloneRepoCloudSelect.selectedIndex].value;
    const folderPathWithoutFName = document.getElementById('clone-repo-cloud-path').textContent + '\\';
    ipcRenderer.invoke('clone-repo', repoUniqueName, folderPathWithoutFName);
  });
});