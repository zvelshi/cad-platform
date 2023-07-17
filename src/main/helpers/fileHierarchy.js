const { s3 } = require('../../services/aws/s3_client.js');

const path = require('path');
const fs = require('fs');

const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

const Store = require('electron-store');
const store = new Store();

const {
  isFileModified
} = require('./isFileModified.js');

const getLocalHierarchy = async (folderPath) => {
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
};

const getBucketHierarchy = async (bucketName) => {
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
};

const compareHierarchies = async (localHierarchy, cloudHierarchy, bucketName, diffResult) => {
    await compareChildren(localHierarchy, cloudHierarchy, bucketName, diffResult);
};

const compareChildren = async (localNode, cloudNode, bucketName, diffResult) => {
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
};

module.exports = {
    getLocalHierarchy,
    getBucketHierarchy,
    compareHierarchies,
    compareChildren
}