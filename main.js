const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { s3 } = require('./s3_client.js');
const { dbdoc } = require('./db_client.js');
const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');

const { CreateBucketCommand } = require('@aws-sdk/client-s3');
const { ScanCommand, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

require('electron-reload')(__dirname, {
  electron: require(`${__dirname}/node_modules/electron`)
});

const store = new Store();
let activeRepo = null;
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
  activeRepo = store.get('activeRepo');

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

    //set active repo
    store.set('activeRepo', uniqueName);
  });

  ipcMain.handle('get-active-repo', async (event) => {
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
  });    

  //for debug purposes only
  ipcMain.on('clear-json', (event) => {
    store.clear();
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