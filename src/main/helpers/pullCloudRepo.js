const path = require('path');
const fs = require('fs');

const { getFileContentFromS3 } = require('./getFileContentFromS3.js');

const pullCloudRepo = async (hierarchy, folderPath, bucketName) => {
    const destinationPath = path.join(folderPath, hierarchy.name);
    
    try {
      if (hierarchy.type === 'file') {
        const localFilePath = destinationPath;
        const parentDir = path.dirname(localFilePath);

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
          await getFileContentFromS3(hierarchy.path, localFilePath, bucketName);
        } 
      } else if (hierarchy.type === 'folder') {
        if (!fs.existsSync(destinationPath)) {
          try {
            await fs.promises.mkdir(destinationPath, { recursive: true });
            console.log('Folder created:', destinationPath);
          } catch (folderErr) {
            console.error('Error creating folder:', folderErr);
            throw folderErr;
          }
        }
  
        for (const child of hierarchy.children) {
          await pullCloudRepo(child, destinationPath, bucketName);
        }
      }
    } catch (err) {
      console.error('Error occurred during pullCloudRepo:', err);
      throw err;
    }
};

module.exports = {
    pullCloudRepo
};