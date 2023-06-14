const { ipcRenderer } = require('electron');
const { PutObjectCommand, DeleteObjectCommand, ListObjectsCommand, GetObjectCommand  } = require("@aws-sdk/client-s3");
const { s3 } = require("./s3_client.js");
const path = require('path');
const fs = require('fs');

document.addEventListener('DOMContentLoaded', () => {
  const folderButton = document.getElementById('folder-button');
  const refreshButton = document.getElementById('refresh-button');
  const refreshS3Button = document.getElementById('refresh-s3-button');

  folderButton.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-folder-dialog');
    if (!result.canceled) {
      fileList.innerHTML = '';
      const hierarchy = await ipcRenderer.invoke('get-folder-hierarchy');
      displayHierarchy(hierarchy.children, fileList);
    }
  });

  refreshButton.addEventListener('click', async () => {
    await refreshLocal();
  });

  refreshS3Button.addEventListener('click', async () => {
    await refreshS3();
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

  document.getElementById('clone-button').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('open-folder-dialog');
    if (!result.canceled) {
      const selectedFolderPath = result.path;
  
      const bucketName = document.getElementById('bucket-name').value;
      const hierarchy = await getBucketHierarchyClone(bucketName);
  
      await cloneHierarchyToLocalFolder(hierarchy, selectedFolderPath);
  
      alert('The S3 bucket has been cloned to the local directory.');
    }
  });
});

async function cloneHierarchyToLocalFolder(hierarchy, folderPath) {
  const destinationPath = path.join(folderPath, hierarchy.name);

  if (hierarchy.type === 'file') {
    // Check if the file already exists at the destination
    if (!fs.existsSync(destinationPath)) {
      const localFilePath = await getFileContentFromS3(hierarchy.path, destinationPath);

      // Create parent directories recursively
      const parentDir = path.dirname(localFilePath);
      await fs.promises.mkdir(parentDir, { recursive: true });

      const stats = await fs.promises.stat(localFilePath);
      const fileSizeInBytes = stats.size;

      // Update progress element with file name, directory, and file size
      const progressElement = document.getElementById('progress');
      const progress = `Downloading: ${hierarchy.name}\nDirectory: ${path.dirname(localFilePath)}\nSize: ${fileSizeInBytes} bytes\n`;
      progressElement.textContent = progress;

      // Clear progress element after 5 seconds
      setTimeout(() => { progressElement.textContent = ''; }, 150);
    }
  } else if (hierarchy.type === 'folder') {
    if (!fs.existsSync(destinationPath)) {
      await fs.promises.mkdir(destinationPath, { recursive: true });
    }
    for (const child of hierarchy.children) {
      await cloneHierarchyToLocalFolder(child, destinationPath);
    }
  }

  if (hierarchy.name === folderPath) {
    document.getElementById('clone-button').disabled = true;
    await refreshLocal();
    await refreshS3();
    alert('The S3 bucket has been cloned to the local directory.');
  }
}

async function getFileContentFromS3(filePath, localFilePath) {
  const params = {
    Bucket: document.getElementById('bucket-name').value,
    Key: filePath,
  };

  try {
    const data = await s3.send(new GetObjectCommand(params));
    const stream = data.Body;

    await new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(localFilePath);
      stream.pipe(fileStream);

      stream.on('end', resolve);
      stream.on('error', reject);
    });

    return localFilePath;
  } catch (err) {
    console.error('Error getting file content from S3:', err);
    return null;
  }
}

function displayHierarchy(hierarchy, parentElement) {
  hierarchy
    .sort((a, b) => {
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

async function refreshS3() {
  const fileExplorer = document.getElementById('file-explorer');
  fileExplorer.innerHTML = '';

  const bucketName = document.getElementById('bucket-name').value;
  const hierarchy = await getBucketHierarchyViewer(bucketName);
  displayHierarchy(hierarchy, fileExplorer);
}

async function refreshLocal() {
  const fileList = document.getElementById('fileList');
  fileList.innerHTML = '';

  const hierarchy = await ipcRenderer.invoke('get-folder-hierarchy');
  displayHierarchy(hierarchy.children, fileList);
}

async function getBucketHierarchyClone(bucketName) {
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

  return hierarchy;
}

async function getBucketHierarchyViewer(bucketName) {
  const res = await s3.send(new ListObjectsCommand({ 
    Bucket: bucketName 
  }));
  const contents = res.Contents;

  const children = [];

  for (const content of contents) {
    const key = content.Key;
    const parts = key.split('/');

    let currentFolder = children;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      let childFolder = currentFolder.find((child) => child.name === folderName);
      if (!childFolder) {
        childFolder = {
          name: folderName,
          path: parts.slice(0, i + 1).join('/'),
          type: 'folder',
          isModified: false,
          children: [],
        };
        currentFolder.push(childFolder);
      }
      currentFolder = childFolder.children;
    }

    const fileName = parts[parts.length - 1];
    const file = {
      name: fileName,
      path: key,
      type: 'file',
      isModified: false,
    };
    currentFolder.push(file);
  }

  return children;
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
    await refreshS3();
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
    await refreshS3();
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