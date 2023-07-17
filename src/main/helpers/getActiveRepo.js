const { dbdoc } = require('../../services/aws/db_client.js');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { getLocalRepos } = require('./getReposList.js');
const Store = require('electron-store');
const store = new Store();

const getActiveRepoLocal = async () => {
    const activeRepo = store.get('activeRepo');
  
    const localRepos = await getLocalRepos();
  
    for (let i = 0; i < localRepos.length; i++){
      if (localRepos[i].uniqueName === activeRepo){
  
        return localRepos[i];
      }
    }
    return null;
};

const getActiveRepoCloud = async () => {
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
};

module.exports = {
    getActiveRepoLocal,
    getActiveRepoCloud
};