const { dbdoc } = require('../../services/aws/db_client.js');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

// electron-store instance for local storage
const Store = require('electron-store');
const store = new Store();

const getLocalRepos = async () => {
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
};

const getCloudRepos = async () => {
    const res = await dbdoc.send(new ScanCommand({
      TableName: 'repositories',
    }));
    return res.Items;
};

module.exports = {
    getLocalRepos,
    getCloudRepos
};