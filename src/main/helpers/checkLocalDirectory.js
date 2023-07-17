const { ipcMain } = require('electron');

const { 
    getLocalHierarchy,
    getBucketHierarchy,
    compareHierarchies,
} = require('./fileHierarchy.js');

const checkLocalDirectory = async (activeRepo) => {
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
};

module.exports = {
    checkLocalDirectory
};