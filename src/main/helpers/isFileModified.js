const fs = require('fs');

const {
    calculateCloudFileHash,
    calculateLocalFileHash
} = require('../helpers/calculateFileHash.js');

const isFileModified = async (bucketName, filePath, localFilePath) => {
    if (!fs.existsSync(localFilePath)) {
      return true;
    }
  
    const remoteHash = await calculateCloudFileHash(bucketName, filePath);
    const localHash = await calculateLocalFileHash(localFilePath);
    
    return remoteHash !== localHash;
  }

module.exports = {
    isFileModified
}