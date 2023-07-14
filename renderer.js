/*
* File Name: renderer.js
* Date Created: 2023-06-08
* Last Modified: 2023-07-13
* Purpose: This file interfaces the HTML file inputs with the Javascript DOM commmands.
*/

const { ipcRenderer } = require('electron');
const chokidar = require('chokidar');

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

  ipcRenderer.invoke('get-active-repo-local').then((activeRepo) => {
    const watcher = chokidar.watch(activeRepo.folderPath, {
      ignored: /^\./, // ignore dot files
      persistent: true,
    });

    if (activeRepo){
      ipcRenderer.invoke('check-local-directory', activeRepo).then((diffResult) => {
        updateList(diffResult);
      
        watcher
        .on('add', (filePath) => {
          diffResult.newFiles.push(filePath);
          updateList(diffResult);
        })
        .on('change', (filePath) => {
          if (!diffResult.newFiles.includes(filePath) && !diffResult.modifiedFiles.includes(filePath)) {
            diffResult.modifiedFiles.push(filePath);
            updateList(diffResult);
          }
        })
        .on('unlink', (filePath) => {
          if (!diffResult.newFiles.includes(filePath) && !diffResult.modifiedFiles.includes(filePath)) {
            diffResult.deletedFiles.push(filePath);
            updateList(diffResult);
          }
        });
      });
    }

    ipcRenderer.on('update-list', (event, diffResult) => {
      updateList(diffResult);
    });
  });

  pushBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#changes-list input[type="checkbox"]');
    const selectedFiles = {};
  
    checkboxes.forEach((checkbox) => {
      if (checkbox.checked) {
        const fileSection = checkbox.closest('ul').previousElementSibling.textContent;
        const fileName = checkbox.nextElementSibling.textContent;
        selectedFiles[fileSection] = selectedFiles[fileSection] || []; // Initialize property as an empty array if it doesn't exist
        selectedFiles[fileSection].push(fileName);
      }
    });

    console.log(selectedFiles);

    ipcRenderer.invoke('push-changes', selectedFiles).then((activeRepoObject) => {
      ipcRenderer.invoke('check-local-directory', activeRepoObject).then((diffResult) => {
        updateList(diffResult);
      });
    });
  });
  
  changeRepoSelect.addEventListener('input', () => {
    const activeRepo = changeRepoSelect.options[changeRepoSelect.selectedIndex].value;
    ipcRenderer.invoke('set-active-repo', activeRepo);
    document.getElementById('active-repo').innerText = changeRepoSelect.options[changeRepoSelect.selectedIndex].innerText;
    ipcRenderer.invoke('get-active-repo-local').then((activeRepoObject) => {
      ipcRenderer.invoke('check-local-directory', activeRepoObject).then((diffResult) => {
        updateList(diffResult);
      });
    });
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
          ipcRenderer.invoke('get-local-repos').then((localRepos) => {
          if (localRepos.some((localRepo) => localRepo.uniqueName === repo.id)) {
            option.setAttribute('disabled', 'disabled');
          }
          cloneRepoCloudSelect.appendChild(option);
          });
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

function updateList(diffResult) {
  const changesList = document.getElementById('changes-list');
  changesList.innerHTML = ''; // Clear the existing list

  const newFiles = diffResult.newFiles;
  const modifiedFiles = diffResult.modifiedFiles;
  const deletedFiles = diffResult.deletedFiles;

  // Helper function to create a list item element with the specified text
  function createListItem(text) {
    const li = document.createElement('li');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = text;
    checkbox.checked = true;
    li.appendChild(checkbox);
  
    const fileName = document.createElement('span');
    fileName.textContent = text;
    li.appendChild(fileName);
  
    return li;
  }

  // Display new files
  if (newFiles.length > 0) {
    const newFilesHeader = document.createElement('h3');
    newFilesHeader.textContent = 'New';
    changesList.appendChild(newFilesHeader);

    const newFilesList = document.createElement('ul');
    for (const file of newFiles) {
      const listItem = document.createElement('li');
      listItem.appendChild(createListItem(file));
      newFilesList.appendChild(listItem);
    }
    changesList.appendChild(newFilesList);
  }

  // Display modified files
  if (modifiedFiles.length > 0) {
    const modifiedFilesHeader = document.createElement('h3');
    modifiedFilesHeader.textContent = 'Modified';
    changesList.appendChild(modifiedFilesHeader);

    const modifiedFilesList = document.createElement('ul');
    for (const file of modifiedFiles) {
      const listItem = document.createElement('li');
      listItem.appendChild(createListItem(file));
      modifiedFilesList.appendChild(listItem);
    }
    changesList.appendChild(modifiedFilesList);
  }

  // Display deleted files
  if (deletedFiles.length > 0) {
    const deletedFilesHeader = document.createElement('h3');
    deletedFilesHeader.textContent = 'Deleted';
    changesList.appendChild(deletedFilesHeader);

    const deletedFilesList = document.createElement('ul');
    for (const file of deletedFiles) {
      const listItem = document.createElement('li');
      listItem.appendChild(createListItem(file));
      deletedFilesList.appendChild(listItem);
    }
    changesList.appendChild(deletedFilesList);
  }
}