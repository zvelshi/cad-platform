const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { s3 } = require('./s3_client.js');
const { dbdoc } = require('./db_client.js');
const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const { CreateBucketCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

require('electron-reload')(__dirname, {
  electron: require(`${__dirname}/node_modules/electron`)
});

const store = new Store();
let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
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

    //create local json entry 
    store.set(uniqueName, {
      friendlyName,
      organization,
      folderPath
    });

    //create db entry
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
  
    //create s3 bucket
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

    //set active repo
    store.set('activeRepo', uniqueName);
  });

  ipcMain.handle('get-active-repo', async (event) => {
    return await getActiveRepo();
  });

  ipcMain.handle('set-active-repo', async (event, uniqueName) => {
    store.set('activeRepo', uniqueName);
  });

  ipcMain.handle('get-local-repos', async (event) => {
    return await getLocalRepos();
  });

  ipcMain.handle('get-cloud-repos', async (event) => {
    const res = await dbdoc.send(new ScanCommand({
      TableName: 'repositories',
    }));
    return res.Items;
  });

  ipcMain.handle('clone-repo', async (event, repoUniqueName, folderPathWithoutFName) => {
    //get data from dynamodb
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

    //create local json entry 
    store.set(repoUniqueName, {
      friendlyName: repoData.friendlyName,
      organization: repoData.organization,
      folderPath: repoData.folderPath
    });
    
    //clone s3 bucket
    const hierarchy = await getBucketHierarchyClone(repoData.uniqueName);
    cloneCloudRepo(hierarchy, repoData.folderPath, repoData.uniqueName);

    //set active repo
    store.set('activeRepo', repoUniqueName);
  });

  ipcMain.handle('pull-repo', async (event) => {
    const activeRepo = store.get('activeRepo');
    const localRepos = await getLocalRepos();

    for (let i = 0; i < localRepos.length; i++) {
      if(localRepos[i].uniqueName === activeRepo) {
        const hierarchy = await getBucketHierarchyClone(localRepos[i].uniqueName);
        cloneCloudRepo(hierarchy, localRepos[i].folderPath, localRepos[i].uniqueName);
      }
    }
  });

  //start of debug section
  ipcMain.on('clear-json', (event) => {
    store.clear();
  });
  //end of debug section
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

async function getBucketHierarchyClone(bucketName) {
  const res = await s3.send(new ListObjectsV2Command ({ 
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

async function getActiveRepo(){
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