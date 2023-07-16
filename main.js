/*
* File Name: main.js
* Date Created: 2023-06-08
* Last Modified: 2023-07-16
* Purpose: This file interacts with remote databases and AWS file storage solutions to carry out the logic commands to sync and interface a local directory with a remote directory
*/

// electron app main process
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

// aws sdk: s3 and dynabodb
const { s3 } = require('./s3_client.js');
const { dbdoc } = require('./db_client.js');

// uuid: unique id generator, crypto: hashing
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// path,  fs, chokidar: file system
const path = require('path');
const fs = require('fs');

// s3 client api commands
const {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

// dynamodb client api commands
const { 
  PutCommand, 
  GetCommand, 
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

// electron-reload instance auto reloads
require('electron-reload')(__dirname, {
  electron: require(`${__dirname}/node_modules/electron`),
});

// electron-store instance for local storage
const Store = require('electron-store');
const store = new Store();

// electron main window instance
let mainWindow;

// ------------------- Start of mainWindow code -------------------

const createWindow = () => {

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    //autoHideMenuBar: true,
    icon: __dirname + '/no_gc.ico',
  });

  mainWindow.loadFile('index.html');

  ipcMain.handle('open-folder-dialog', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (!result.canceled) {
      return result.filePaths[0];
    } else {
      return null;
    }
  });

  ipcMain.on('create-repo', async (event, repoData) => {

    const { folderPath, friendlyName, organization } = repoData;  

    const uniqueName = uuidv4();

    store.set(uniqueName, {
      friendlyName,
      organization,
      folderPath
    });

    try {
      await dbdoc.send(new PutCommand({ 
        TableName: 'repositories',
        Item: {
          id: uniqueName,
          friendlyName,
          organization,
        }
      }));
    } catch (err) {
      console.log(err);
    }

    const s3Params = {
      Bucket: uniqueName,
      ACL: 'private'
    };

    try {
      await s3.send(new CreateBucketCommand(s3Params));
    } catch (err) {
      console.log(err);
    }

    fs.mkdirSync(folderPath);    

    store.set('activeRepo', uniqueName);
  });

  ipcMain.handle('get-active-repo-cloud', async (event) => {
    return await getActiveRepoCloud();
  });
  
  ipcMain.handle('get-active-repo-local', async (event) => {
    return await getActiveRepoLocal();
  });

  ipcMain.handle('set-active-repo', async (event, uniqueName) => {
    store.set('activeRepo', uniqueName);
  });

  ipcMain.handle('get-local-repos', async (event) => {
    return await getLocalRepos();
  });

  ipcMain.handle('get-cloud-repos', async (event) => {
    return await getCloudRepos();
  });

  ipcMain.handle('clone-repo', async (event, repoUniqueName, folderPathWithoutFName) => {
    const res = await dbdoc.send(new GetCommand({
      TableName: 'repositories',
      Key: {
        id: repoUniqueName,
      }
    }));

    const repoData = {
      uniqueName: repoUniqueName,
      friendlyName: res.Item.friendlyName,
      organization: res.Item.organization,
      folderPath: folderPathWithoutFName
    }

    store.set(repoUniqueName, {
      friendlyName: repoData.friendlyName,
      organization: repoData.organization,
      folderPath: repoData.folderPath + '/' + repoData.friendlyName
    });

    const hierarchy = await getBucketHierarchy(repoData.uniqueName);
    await cloneCloudRepo(hierarchy, repoData.folderPath, repoData.uniqueName);

    store.set('activeRepo', repoUniqueName);

    await alertDialog('Clone Complete', 'The repository has been cloned successfully.', ['OK']);
  });

  ipcMain.handle('pull-repo', async (event) => {
    const activeRepo = await getActiveRepoLocal();
    const hierarchy = await getBucketHierarchy(activeRepo.uniqueName);
    const folderPath = activeRepo.folderPath.slice(0, activeRepo.folderPath.lastIndexOf('\\'));

    await pullCloudRepo(hierarchy, folderPath, activeRepo.uniqueName);

    await alertDialog('Pull Complete', 'The repository has been pulled successfully.', ['OK']);
  });

  ipcMain.handle('clone-local-repo', async (event, repoData) => {

    const uniqueName = uuidv4();

    store.set(uniqueName, {
      friendlyName: repoData.friendlyName,
      organization: repoData.organization,
      folderPath: repoData.folderPath
    });

    store.set('activeRepo', uniqueName);

    try {
      await dbdoc.send(new PutCommand({ 
        TableName: 'repositories',
        Item: {
          id: uniqueName,
          friendlyName: repoData.friendlyName,
          organization: repoData.organization,
        }
      }));
    } catch (err) {
      console.log(err);
    } 

    const s3Params = {
      Bucket: uniqueName,
      ACL: 'private'
    };

    try {
      await s3.send(new CreateBucketCommand(s3Params));
    } catch (err) {
      console.log(err);
    }

    await cloneLocalRepo(uniqueName, repoData.folderPath);

    await alertDialog('Clone Complete', 'The repository has been cloned successfully.', ['OK']);
  });

  ipcMain.handle('check-local-directory', async (event, activeRepo) => {
    return await checkLocalDirectory(activeRepo);
  });

  ipcMain.handle('push-changes', async (event, selectedFiles) => {
    const activeRepo = await getActiveRepoLocal();
  
    const diffResult = await checkLocalDirectory(activeRepo);
  
    const addedFiles = diffResult.newFiles;
    const modifiedFiles = diffResult.modifiedFiles;
    const deletedFiles = diffResult.deletedFiles;

    try {
      for (const filePath of addedFiles) {
        if (selectedFiles.New.includes(filePath)) {
          const fileName = filePath.slice(filePath.lastIndexOf('\\') + 1);
          console.log(filePath, ":", fileName, ":", activeRepo.uniqueName)
          await uploadFileToS3(filePath, fileName, activeRepo.uniqueName);
        }
      }
    } catch (err) { console.log(err); }

    try {       
      for (const filePath of modifiedFiles) {
        if (selectedFiles.Modified.includes(filePath)) {
          const fileName = filePath.slice(filePath.lastIndexOf('\\') + 1);
          await modifyFileS3(filePath, fileName, activeRepo.uniqueName);
        }
      }
    } catch (err) { console.log(err); }
    
    try { 
      for (const filePath of deletedFiles) {
        if (selectedFiles.Deleted.includes(filePath)) {
          console.log(filePath, activeRepo.uniqueName)
          await deleteFileS3(filePath, activeRepo.uniqueName);
        }
      }
     } catch (err) { console.log(err); }
    
    // Refresh the diff result after the push
    const updatedDiffResult = await checkLocalDirectory(activeRepo);
    mainWindow.webContents.send('update-list', updatedDiffResult);

    return activeRepo;
  });
};

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  })
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

//-------------------end of mainWindow code----------------------

//-------------------start of helper functions-------------------

async function findFileDirectoryInBucket(bucketHierarchy, fileName) {
  let fileKey = '';
  if (bucketHierarchy.type == 'folder') {
    try {
      for (const child of bucketHierarchy.children) {
        fileKey = await findFileDirectoryInBucket(child, fileName);
        if (fileKey != '') {
          break;
        }
      }
    } catch (err) { 
      console.log(err); 
    }
  } else if (bucketHierarchy.type == 'file' && bucketHierarchy.name == fileName) {
    fileKey = bucketHierarchy.path;
  }
  return fileKey;
}

async function uploadFileToS3(filePath, fileName, bucketName) {
  const fileContentStream = fs.createReadStream(filePath);
  const repoFriendlyName = (await getActiveRepoLocal()).friendlyName;
  
  let fileKey = filePath.slice(filePath.indexOf(repoFriendlyName) + repoFriendlyName.length + 1);
  fileKey = fileKey.replace(/\\/g, '/');

  const s3Params = {
    Bucket: bucketName,
    Key: fileKey,
    Body: fileContentStream
  };

  try {
    await s3.send(new PutObjectCommand(s3Params));
    console.log('File:', fileName, 'uploaded to S3 bucket,', bucketName, '.');
  } catch (err) {
    console.log(err);
  }
}

async function modifyFileS3(filePath, fileName, bucketName) {
  const fileContentStream = fs.createReadStream(filePath);  
  const bucketHierarchy = await getBucketHierarchy(bucketName);
  
  let fileKey = '';
  if (bucketHierarchy.type == 'folder') {
    fileKey = await findFileDirectoryInBucket(bucketHierarchy, fileName);
  } else if (bucketHierarchy.type == 'file' && bucketHierarchy.name == fileName) {
    if (bucketHierarchy.path == '') {
      fileKey = fileName;
    } else {
      fileKey = bucketHierarchy.path;
    }
  }

  console.log(fileKey);

  const s3Params = {
    Bucket: bucketName,
    Key: fileKey,
    Body: fileContentStream
  };

  try {
    await s3.send(new PutObjectCommand(s3Params));
    console.log('File:', fileName, 'modified on S3 bucket,', bucketName, '.');
  } catch (err) {
    console.log("Error uploading file", fileName, "to bucket, error:", err);
  }
}

async function deleteFileS3(fileName, bucketName) {
  const bucketHierarchy = await getBucketHierarchy(bucketName);
  
  let fileKey = '';
  if (bucketHierarchy.type == 'folder') {
    fileKey = await findFileDirectoryInBucket(bucketHierarchy, fileName);
  } else if (bucketHierarchy.name == fileName) {
    fileKey = bucketHierarchy.path;
  }
  
  const s3Params = {
    Bucket: bucketName,
    Key: fileName
  };

  try {
    await s3.send(new DeleteObjectCommand(s3Params));
    console.log('File: ', fileName, ' deleted from S3 bucket, ', bucketName, '.');
  } catch (err) {
    console.log("Error deleting file", fileName, " from bucket, error: ", err);
  }
}

async function cloneLocalRepo(uniqueName, folderPath) {
  const files = await fs.promises.readdir(folderPath, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(folderPath, file.name);

    if (file.isDirectory()) {
      const folderKey = file.name + '/';
      await s3.send(new PutObjectCommand({
        Bucket: uniqueName,
        Key: folderKey,
      }));

      await cloneLocalRepo(uniqueName, filePath);
    } else {
      const fileContentStream = fs.createReadStream(filePath);
      await s3.send(new PutObjectCommand({
        Bucket: uniqueName,
        Key: file.name,
        Body: fileContentStream,
      }));
    }
  }
  // Check for empty directories and create them in the cloud
  const emptyDirs = await findEmptyDirectories(folderPath);
  for (const dirPath of emptyDirs) {
    const folderKey = dirPath.slice(folderPath.length + 1) + '/';
    await s3.send(new PutObjectCommand({
      Bucket: uniqueName,
      Key: folderKey,
    }));
  }
}

async function findEmptyDirectories(folderPath) {
  const dirents = await fs.promises.readdir(folderPath, { withFileTypes: true });
  const emptyDirs = [];

  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      const dirPath = path.join(folderPath, dirent.name).replace(/\\/g, '/');      
      const subDirs = await findEmptyDirectories(dirPath);
      if (subDirs.length === 0) {
        emptyDirs.push(dirPath);
      } else {
        emptyDirs.push(...subDirs);
      }
    }
  }

  return emptyDirs;
}

async function pullCloudRepo(hierarchy, folderPath, bucketName) {
  const destinationPath = path.join(folderPath, hierarchy.name);

  console.log('Pulling:', destinationPath);

  try {
    if (hierarchy.type === 'file') {
      const localFilePath = destinationPath;
      const parentDir = path.dirname(localFilePath);

      console.log('Creating parent directory:', parentDir);

      try {
        if (!fs.existsSync(parentDir)) {
          await fs.promises.mkdir(parentDir, { recursive: true });
          console.log('Parent directory created:', parentDir);
        } else {
          console.log('Parent directory already exists:', parentDir);
        }
      } catch (parentDirErr) {
        console.error('Error creating parent directory:', parentDirErr);
        throw parentDirErr;
      }

      if (!fs.existsSync(localFilePath)) {
        console.log('File does not exist locally, fetching from S3:', hierarchy.path);
        await getFileContentFromS3(hierarchy.path, localFilePath, bucketName);
        console.log('File content fetched and written:', localFilePath);
      } else {
        console.log('File already exists locally, skipping fetch:', localFilePath);
      }
    } else if (hierarchy.type === 'folder') {
      if (!fs.existsSync(destinationPath)) {
        console.log('Creating folder:', destinationPath);
        try {
          await fs.promises.mkdir(destinationPath, { recursive: true });
          console.log('Folder created:', destinationPath);
        } catch (folderErr) {
          console.error('Error creating folder:', folderErr);
          throw folderErr;
        }
      } else {
        console.log('Folder already exists:', destinationPath);
      }

      for (const child of hierarchy.children) {
        await pullCloudRepo(child, destinationPath, bucketName);
      }
    }
  } catch (err) {
    console.error('Error occurred during pullCloudRepo:', err);
    throw err;
  }
}

async function isFileModified(bucketName, filePath, localFilePath) {
  if (!fs.existsSync(localFilePath)) {
    return true;
  }

  const remoteHash = await calculateCloudFileHash(bucketName, filePath);

  const localHash = await calculateLocalFileHash(localFilePath);

  return remoteHash !== localHash;
}

async function calculateCloudFileHash(bucketName, filePath) {

  const params = {
    Bucket: bucketName,
    Key: filePath,
  };

  try {
    const data = await s3.send(new GetObjectCommand(params));
    const stream = data.Body;

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  } catch (err) {
    console.error('Error calculating file hash:', err);
    return null;
  }
}

async function calculateLocalFileHash(filePath) {

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

async function cloneCloudRepo(hierarchy, folderPath, bucketName) {
  const destinationPath = path.join(folderPath, hierarchy.name);

  if (hierarchy.type === 'file') {

    if (!fs.existsSync(destinationPath)) {
      const localFilePath = await getFileContentFromS3(hierarchy.path, destinationPath, bucketName);

      const parentDir = path.dirname(localFilePath);
      await fs.promises.mkdir(parentDir, { recursive: true });
    }
  } else if (hierarchy.type === 'folder') {

    if (!fs.existsSync(destinationPath)) {
      await fs.promises.mkdir(destinationPath, { recursive: true });
    }

    for (const child of hierarchy.children) {
      await cloneCloudRepo(child, destinationPath, bucketName);
    }
  }
}

async function getFileContentFromS3(filePath, localFilePath, bucketName) {
  const params = {
    Bucket: bucketName,
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

async function getBucketHierarchy(bucketName) {
  const res = await s3.send(new ListObjectsV2Command ({ 
    Bucket: bucketName 
  }));
  const contents = res.Contents;

  const friendlyName = store.get(bucketName).friendlyName;

  const hierarchy = {
    name: friendlyName,
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

async function getActiveRepoCloud(){
  const activeRepo = store.get('activeRepo');

  if (activeRepo) {
    const res = await dbdoc.send(new GetCommand({
      TableName: 'repositories',
      Key: {
        id: activeRepo,
      }
    }));

    return res.Item;
  } else {
    return null;
  }
}

async function getLocalRepos(){
  const localRepos = [];

  const config = store.store;

  for (const key in config) {
    let obj = { uniqueName: '', friendlyName: '', organization: '', folderPath: '' };
    if (key !== 'activeRepo') {
      obj.uniqueName = key;
      obj.friendlyName = config[key].friendlyName;
      obj.organization = config[key].organization;
      obj.folderPath = config[key].folderPath;
      localRepos.push(obj);        
    }
  }

  return localRepos;
}

async function getCloudRepos(){
  const res = await dbdoc.send(new ScanCommand({
    TableName: 'repositories',
  }));
  return res.Items;
}

async function getActiveRepoLocal(){
  const activeRepo = store.get('activeRepo');

  const localRepos = await getLocalRepos();

  for (let i = 0; i < localRepos.length; i++){
    if (localRepos[i].uniqueName === activeRepo){

      return localRepos[i];
    }
  }
  return null;
}

async function alertDialog(title, message, buttons){
  const options = {
    type: 'info',
    title: title,
    message: message,
    buttons: buttons
  };
  dialog.showMessageBoxSync(null, options);
}

async function getLocalHierarchy(folderPath) {
  const friendlyName = path.basename(folderPath);

  const stats = await fs.promises.stat(folderPath);

  const hierarchy = {
    name: friendlyName,
    path: folderPath,
    type: stats.isDirectory() ? 'folder' : 'file',
    isModified: false,
    children: [],
  };

  if (stats.isDirectory()) {
    const dirEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });

    for (const entry of dirEntries) {
      const entryPath = path.join(folderPath, entry.name);
      const childHierarchy = await getLocalHierarchy(entryPath);
      hierarchy.children.push(childHierarchy);
    }
  }
  
  return hierarchy;
}

async function compareHierarchies(localHierarchy, cloudHierarchy, bucketName, diffResult) {
  await compareChildren(localHierarchy, cloudHierarchy, bucketName, diffResult);
}

async function compareChildren(localNode, cloudNode, bucketName, diffResult) {
  const localChildren = localNode.children;
  const cloudChildren = cloudNode.children;

  for (const localChild of localChildren) {
    const matchingCloudChild = cloudChildren.find((cloudChild) => cloudChild.name === localChild.name);
    if (!matchingCloudChild) {
      if (localChild.type === 'file') {
        diffResult.newFiles.push(localChild.path);
      } else {
        diffResult.newFiles.push(localChild.path + '/');
      }
    } else {
      if (localChild.type === 'file' && matchingCloudChild.type === 'file') {
        const isModified = await isFileModified(bucketName, matchingCloudChild.path, localChild.path);
        if (isModified) {
          diffResult.modifiedFiles.push(localChild.path);
        }
      } else if (localChild.type === 'folder' && matchingCloudChild.type === 'folder') {
        await compareChildren(localChild, matchingCloudChild, bucketName, diffResult);
      }
    }
  }

  for (const cloudChild of cloudChildren) {
    const matchingLocalChild = localChildren.find((localChild) => localChild.name === cloudChild.name);

    if (!matchingLocalChild) {
      if (cloudChild.type === 'file') {
        diffResult.deletedFiles.push(cloudChild.path);
      } else {
        diffResult.deletedFiles.push(cloudChild.path + '/');
      }
    }
  }
}

async function checkLocalDirectory(activeRepo){
  const localHierarchy = await getLocalHierarchy(activeRepo.folderPath);
    const cloudHierarchy = await getBucketHierarchy(activeRepo.uniqueName);
  
    const diffResult = {
      newFiles: [],
      modifiedFiles: [],
      deletedFiles: [],
    };
  
    await compareHierarchies(localHierarchy, cloudHierarchy, activeRepo.uniqueName, diffResult);
    ipcMain.emit('update-list', diffResult);
    
  return diffResult;
}

//-------------------end of helper functions-------------------