// electron app main process
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

// aws sdk: s3 and dynabodb
const { s3 } = require('./s3_client.js');
const { dbdoc } = require('./db_client.js');

// uuid: unique id generator, crypto: hashing
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// path and fs: file system
const path = require('path');
const fs = require('fs');

// s3 client api commands
const {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');

// dynamodb client ai commands
const { 
  PutCommand, 
  GetCommand, 
  ScanCommand 
} = require('@aws-sdk/lib-dynamodb');

// electron-reload instance auto reloads
const Store = require('electron-store');
require('electron-reload')(__dirname, {
  electron: require(`${__dirname}/node_modules/electron`),
});

// electron-store instance for local storage
const store = new Store();

// electron main window instance
let mainWindow;

// ------------------- Start of mainWindow code -------------------

const createWindow = () => {

  // main window parameters
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // load index.html
  mainWindow.loadFile('index.html');

  // when a file dialog is opened, return the path chosen
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

  // create a repo from scratch: cloud and local instance need to be created
  ipcMain.on('create-repo', async (event, repoData) => {

    // get data from repoData object
    const { folderPath, friendlyName, organization } = repoData;  

    // generate a unique name for the repo
    const uniqueName = uuidv4();

    //create local json entry 
    store.set(uniqueName, {
      friendlyName,
      organization,
      folderPath
    });

    //create dynamodb entry
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
  
    //create s3 bucket using the unique name
    const s3Params = {
      Bucket: uniqueName,
      ACL: 'private'
    };

    try {
      await s3.send(new CreateBucketCommand(s3Params));
    } catch (err) {
      console.log(err);
    }

    //create local folder
    fs.mkdirSync(folderPath);    

    //set as the active repo
    store.set('activeRepo', uniqueName);
  });

  // get the current active repo as an object
  ipcMain.handle('get-active-repo', async (event) => {
    return await getActiveRepo();
  });

  // set the current active repo by unique name
  ipcMain.handle('set-active-repo', async (event, uniqueName) => {
    store.set('activeRepo', uniqueName);
  });

  // returns a list of local repos as an array of objects
  ipcMain.handle('get-local-repos', async (event) => {
    return await getLocalRepos();
  });

  // returns a list of cloud repos as an array of objects
  ipcMain.handle('get-cloud-repos', async (event) => {
    const res = await dbdoc.send(new ScanCommand({
      TableName: 'repositories',
    }));
    return res.Items;
  });

  // clone an existing repo from the cloud to a local instance
  ipcMain.handle('clone-repo', async (event, repoUniqueName, folderPathWithoutFName) => {
    
    // get repo details from dynamodb
    const res = await dbdoc.send(new GetCommand({
      TableName: 'repositories',
      Key: {
        id: repoUniqueName,
      }
    }));

    // create repodata object
    const repoData = {
      uniqueName: repoUniqueName,
      friendlyName: res.Item.friendlyName,
      organization: res.Item.organization,
      folderPath: folderPathWithoutFName
    }

    // create local json entry 
    store.set(repoUniqueName, {
      friendlyName: repoData.friendlyName,
      organization: repoData.organization,
      folderPath: repoData.folderPath + '/' + repoData.friendlyName
    });
    
    // clone s3 bucket - get the bucket hierarchy and clone it recursively
    const hierarchy = await getBucketHierarchy(repoData.uniqueName);
    await cloneCloudRepo(hierarchy, repoData.folderPath, repoData.uniqueName);

    // set active repo
    store.set('activeRepo', repoUniqueName);

    // alert when done cloning
    const options = {
      type: 'info',
      title: 'Clone Complete',
      message: 'The repository has been cloned successfully.',
      buttons: ['OK']
    };
    dialog.showMessageBox(null, options);
  });

  // pull changes from an existing repo from the cloud to an existing local instance
  ipcMain.handle('pull-repo', async (event) => {

    // get local data for the current active repo
    const activeRepo = await getActiveRepoLocal();

    // get remote bucket hierarchy
    const hierarchy = await getBucketHierarchy(activeRepo.uniqueName);
    
    // get the local bare folder path
    const folderPath = activeRepo.folderPath.slice(0, activeRepo.folderPath.lastIndexOf('\\'));
    
    // pull the cloud repo to the local instance recursively
    await pullCloudRepo(hierarchy, folderPath, activeRepo.uniqueName);
  
    // alert when done pulling
    const options = {
      type: 'info',
      title: 'Pull Complete',
      message: 'The repository has been pulled successfully.',
      buttons: ['OK']
    };
    dialog.showMessageBox(null, options);
  });
};

// create the main window when the app is ready
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  })
});

// when the window is closed, terminate the app
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

//-------------------end of mainWindow code----------------------

//-------------------start of helper functions-------------------

// recursively pull the cloud repo to the local instance
async function pullCloudRepo(hierarchy, folderPath, bucketName) {
  
  // get the destination path
  const destinationPath = path.join(folderPath, hierarchy.name);

  // check if the object at the top of the hierarchy is a file or a folder
  if (hierarchy.type === 'file') {
    const localFilePath = destinationPath;

    // check if the file has been modified using crypto hashing
    const isModified = await isFileModified(bucketName, hierarchy.path, localFilePath);

    // if the file has been modified, grab its dir and pull it from the cloud
    if (isModified) {
      const parentDir = path.dirname(localFilePath);
      await fs.promises.mkdir(parentDir, { recursive: true });
      await getFileContentFromS3(hierarchy.path, localFilePath, bucketName);
    }

  // if the object at the top of the hierarchy is a folder
  } else if (hierarchy.type === 'folder') {
    if (!fs.existsSync(destinationPath)) {

      // create the folder if it doesn't exist
      await fs.promises.mkdir(destinationPath, { recursive: true });
    }

    // pull the children of the folder recursively
    for (const child of hierarchy.children) {
      await pullCloudRepo(child, destinationPath, bucketName);
    }
  }
}

// check if a file has been modified to the version in the cloud
async function isFileModified(bucketName, filePath, localFilePath) {

  // if the file doesn't exist locally, consider it modified
  if (!fs.existsSync(localFilePath)) {
    return true;
  }

  // calculate the hash of the file in the cloud
  const remoteHash = await calculateCloudFileHash(bucketName, filePath);

  // calculate the hash of the local file
  const localHash = await calculateLocalFileHash(localFilePath);

  // if the hashes are different, the file has been modified
  return remoteHash !== localHash;
}

// calculate the hash of a file in the cloud
async function calculateCloudFileHash(bucketName, filePath) {

  // get the file from the cloud
  const params = {
    Bucket: bucketName,
    Key: filePath,
  };

  try {
    const data = await s3.send(new GetObjectCommand(params));
    const stream = data.Body;

    // calculate the hash while streaming the file for download then return it
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

// calculate the hash of a local file
async function calculateLocalFileHash(filePath) {

  // calculate the hash while streaming through the local file then return it
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

// clone the cloud repo to the local instance recursively, no crypto hashing
async function cloneCloudRepo(hierarchy, folderPath, bucketName) {
  const destinationPath = path.join(folderPath, hierarchy.name);

  if (hierarchy.type === 'file') {
    // Check if the file already exists at the destination
    if (!fs.existsSync(destinationPath)) {
      const localFilePath = await getFileContentFromS3(hierarchy.path, destinationPath, bucketName);

      // Create parent directories recursively
      const parentDir = path.dirname(localFilePath);
      await fs.promises.mkdir(parentDir, { recursive: true });
    }
  } else if (hierarchy.type === 'folder') {
    // Create the folder at the destination
    if (!fs.existsSync(destinationPath)) {
      await fs.promises.mkdir(destinationPath, { recursive: true });
    }

    // Recursively clone child files and folders
    for (const child of hierarchy.children) {
      await cloneCloudRepo(child, destinationPath, bucketName);
    }
  }
}

// get the content of a file from S3
async function getFileContentFromS3(filePath, localFilePath, bucketName) {
  const params = {
    Bucket: bucketName,
    Key: filePath,
  };
  
  // stream the file from S3 
  try {
    const data = await s3.send(new GetObjectCommand(params));
    const stream = data.Body;

    await new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(localFilePath);
      stream.pipe(fileStream);

      stream.on('end', resolve);
      stream.on('error', reject);
    });

    // return the local file path of the new file
    return localFilePath;
  } catch (err) {
    console.error('Error getting file content from S3:', err);
    return null;
  }  
}

// get the hierarchy of a bucket as a JSON object
async function getBucketHierarchy(bucketName) {

  // get the contents of the bucket
  const res = await s3.send(new ListObjectsV2Command ({ 
    Bucket: bucketName 
  }));
  const contents = res.Contents;

  // get the friendly name of the repo from local storage
  const friendlyName = store.get(bucketName).friendlyName;

  // create the hierarchy object using the friendly name
  const hierarchy = {
    name: friendlyName,
    path: '',
    type: 'folder',
    isModified: false,
    children: [],
  };

  // iterate through the contents of the bucket
  for (const content of contents) {
    const key = content.Key;

    // split the key into parts by folder layer
    const parts = key.split('/');

    // iterate through the parts of the key to build the hierarchy
    let currentFolder = hierarchy;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];

      // check if the folder already exists in the hierarchy
      let childFolder = currentFolder.children.find((child) => child.name === folderName);
      if (!childFolder) {

        // get the details of the folder
        childFolder = {
          name: folderName,
          path: parts.slice(0, i + 1).join('/'),
          type: 'folder',
          isModified: false,
          children: [],
        };

        // add the folder as a child to the current folder
        currentFolder.children.push(childFolder);
      }

      // set the current folder to the child folder for further recursion
      currentFolder = childFolder;
    }

    // get the file details
    const fileName = parts[parts.length - 1];
    const file = {
      name: fileName,
      path: key,
      type: 'file',
      isModified: false,
    };

    // add the file to the current folder
    currentFolder.children.push(file);
  }

  // return the hierarchy object
  return hierarchy;
}

// get the current active repo as an object from the cloud db
async function getActiveRepo(){

  // fetch the unique name of the active repo from local storage
  const activeRepo = store.get('activeRepo');

  // fetch the repo object from the cloud db
  if (activeRepo) {
    const res = await dbdoc.send(new GetCommand({
      TableName: 'repositories',
      Key: {
        id: activeRepo,
      }
    }));

    // return the following data as an object: uniqueName, friendlyName, organization
    return res.Item;
  } else {
    return null;
  }
}

// get an array of local repos as objects from local storage (JSON)
async function getLocalRepos(){
  const localRepos = [];

  // fetch the repo array of objects in JSON format
  const config = store.store;
  
  // for each key in the array, if it is a repo object, push it to the localRepos array
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

  // return the array of local repos
  return localRepos;
}

// get the current active repo as an object from local storage (JSON)
async function getActiveRepoLocal(){

  // fetch unique name from local storage
  const activeRepo = store.get('activeRepo');

  // fetch list of local repos
  const localRepos = await getLocalRepos();

  // iterate through local repos until unique names match
  for (let i = 0; i < localRepos.length; i++){
    if (localRepos[i].uniqueName === activeRepo){

      // return the active repo object
      return localRepos[i];
    }
  }
  return null;
}