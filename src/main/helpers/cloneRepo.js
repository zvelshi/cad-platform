const { s3 } = require('../../services/aws/s3_client.js');

const path = require('path');
const fs = require('fs');

const { PutObjectCommand } = require('@aws-sdk/client-s3');

const { getFileContentFromS3 } = require('./getFileContentFromS3.js');
const { findEmptyDirectories } = require('./findEmptyDirectories.js');

const cloneCloudRepo = async (hierarchy, folderPath, bucketName) => {
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
};

const cloneLocalRepo = async (uniqueName, folderPath, hierarchy) => {
  const emptyDirs = await findEmptyDirectories(folderPath);

  for (const dirPath of emptyDirs) {
    const folderKey = dirPath.slice(folderPath.length + 1) + '/';
    await s3.send(new PutObjectCommand({
      Bucket: uniqueName,
      Key: folderKey,
    }));
  }

  await cloneFiles(uniqueName, folderPath, hierarchy);
};
const cloneFiles = async (uniqueName, folderPath, hierarchy) => {
  for (const child of hierarchy.children) {
    if (child.type == 'folder') {
      await cloneFiles(uniqueName, folderPath, child);
    } else if (child.type == 'file') {
      const fileContentStream = fs.createReadStream(child.path);
      const fileKey = child.path.slice(folderPath.length + 1).replace(/\\/g, '/');

      await s3.send(new PutObjectCommand({
        Bucket: uniqueName,
        Key: fileKey,
        Body: fileContentStream,
      }));      
    }
  }
};

module.exports = {
    cloneFiles,
    cloneCloudRepo,
    cloneLocalRepo
}