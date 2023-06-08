const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  const folderButton = document.getElementById('folderButton');
  const fileList = document.getElementById('fileList');

  folderButton.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-folder-dialog');
    if (!result.canceled) {
      fileList.innerHTML = '';
      const hierarchy = await ipcRenderer.invoke('get-folder-hierarchy');
      displayHierarchy(hierarchy, fileList);
    }
  });

  const refreshButton = document.getElementById('refreshButton');
  refreshButton.addEventListener('click', async () => {
    fileList.innerHTML = '';
    const hierarchy = await ipcRenderer.invoke('get-folder-hierarchy');
    displayHierarchy(hierarchy, fileList);
  });
  ipcRenderer.on('file-changed', (event, filePath, changeType) => {
    const fileElement = document.getElementById(filePath);
    if (fileElement) {
      fileElement.classList.remove('modified', 'added', 'deleted');
      if (changeType === 'change') {
        fileElement.classList.add('modified');
      } else if (changeType === 'add') {
        fileElement.classList.add('added');
      } else if (changeType === 'unlink') {
        fileElement.classList.add('deleted');
      }
    }
  });

  function displayHierarchy(hierarchy, parentElement) {
    hierarchy
      .sort((a, b) => {
        // Sort by type (folder first) and then by name
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'folder' ? -1 : 1;
      })
      .forEach((item) => {
        const listItem = document.createElement('li');
        listItem.textContent = item.name;
        listItem.id = item.path;
  
        if (item.type === 'file' && item.isModified) {
          listItem.classList.add('modified');
        }
  
        parentElement.appendChild(listItem);
  
        if (item.type === 'folder' && item.children) {
          const subList = document.createElement('ul');
          listItem.appendChild(subList);
  
          // Create a toggle button for collapsing/expanding folder contents
          const toggleButton = document.createElement('span');
          toggleButton.classList.add('toggle-button');
          toggleButton.textContent = '-';
          listItem.insertBefore(toggleButton, listItem.firstChild);
  
          // Initially collapse the folder contents
          subList.style.display = 'none';
  
          toggleButton.addEventListener('click', () => {
            // Toggle the display of the folder contents
            if (subList.style.display === 'none') {
              subList.style.display = 'block';
              toggleButton.textContent = '-';
            } else {
              subList.style.display = 'none';
              toggleButton.textContent = '+';
            }
          });
  
          displayHierarchy(item.children, subList);
        }
      });
  } 
});