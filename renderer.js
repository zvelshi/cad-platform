const { ipcRenderer } = require('electron');
const { PutObjectCommand, DeleteObjectCommand, ListObjectsCommand } = require("@aws-sdk/client-s3");
const { s3 } = require("./s3_client.js");

document.addEventListener('DOMContentLoaded', () => {
  const folderButton = document.getElementById('folder-button');
  const fileList = document.getElementById('fileList');
  const refreshButton = document.getElementById('refresh-button');
  const refreshS3Button = document.getElementById('refresh-s3-button');
  const fileExplorer = document.getElementById('file-explorer');

  folderButton.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-folder-dialog');
    if (!result.canceled) {
      fileList.innerHTML = '';
      const hierarchy = await ipcRenderer.invoke('get-folder-hierarchy');
      displayHierarchy(hierarchy, fileList);
    }
  });

  refreshButton.addEventListener('click', async () => {
    fileList.innerHTML = '';
    const hierarchy = await ipcRenderer.invoke('get-folder-hierarchy');
    displayHierarchy(hierarchy, fileList);
  });

  refreshS3Button.addEventListener('click', async () => {
    fileExplorer.innerHTML = '';
    const bucketName = document.getElementById('bucket-name').value;
    const hierarchy = await getBucketHierarchy(bucketName);
    displayHierarchy(hierarchy, fileExplorer);
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

async function getBucketHierarchy(bucketName) {
  const res = await s3.send(new ListObjectsCommand({ 
    Bucket: bucketName 
  }));
  const contents = res.Contents;

  const hierarchy = {
    name: bucketName,
    path: '',
    type: 'folder',
    isModified: false,
    children: [],
  };

  for (const content of contents) {
    const key = content.Key;
    const parts = key.split('/');

    let currentFolder = hierarchy;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      let childFolder = currentFolder.children.find((child) => child.name === folderName);
      if (!childFolder) {
        childFolder = {
          name: folderName,
          path: parts.slice(0, i + 1).join('/'),
          type: 'folder',
          isModified: false,
          children: [],
        };
        currentFolder.children.push(childFolder);
      }
      currentFolder = childFolder;
    }

    const fileName = parts[parts.length - 1];
    const file = {
      name: fileName,
      path: key,
      type: 'file',
      isModified: false,
    };
    currentFolder.children.push(file);
  }

  return hierarchy.children;
}

document.getElementById('add-file').addEventListener('click', async () => {
  const params = {
    Bucket: document.getElementById('bucket-name').value,
    Key: document.getElementById('add-file-name').value,
    Body: document.getElementById('add-file-content').value,
  };

  try {
    const results = await s3.send(new PutObjectCommand(params));
    showUploadStatus('File upload successful.', 'success');
    return results; // For unit tests.
  } catch (err) {
    showUploadStatus('File upload failed.', 'error');
  }
});

document.getElementById('delete-file').addEventListener('click', async () => {
  const params = {
    Bucket: document.getElementById('bucket-name').value,
    Key: document.getElementById('delete-file-name').value,
  };

  try {
    const results = await s3.send(new DeleteObjectCommand(params));
    showUploadStatus('File deletion successful.', 'success');
    return results; // For unit tests.
  } catch (err) {
    showUploadStatus('File deletion failed.', 'error');
  }
});

function showUploadStatus(message, status) {
  const uploadStatus = document.getElementById('upload-status');
  uploadStatus.textContent = message;
  uploadStatus.className = status;
}