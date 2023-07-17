const { s3 } = require('../../services/aws/s3_client.js');

const fs = require('fs');

const {
  PutObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

const { getActiveRepoLocal } = require('../helpers/getActiveRepo.js');
const { getBucketHierarchy } = require('../helpers/fileHierarchy.js');
const { findFileDirectoryInBucket } = require('../helpers/findFileDirectoryInBucket.js');

const uploadFileToS3 = async (filePath, fileName, bucketName) => {
    const fileContentStream = fs.createReadStream(filePath);
    const repoFriendlyName = (await getActiveRepoLocal()).friendlyName;
    const fileKey = filePath.slice(filePath.indexOf(repoFriendlyName) + repoFriendlyName.length + 1).replace(/\\/g, '/');
  
    const s3Params = {
      Bucket: bucketName,
      Key: fileKey,
      Body: fileContentStream
    };
  
    try {
      await s3.send(new PutObjectCommand(s3Params));
      console.log('File:', fileName, 'uploaded to S3 bucket,', bucketName, '.');
    } catch (err) {
      console.log(err);
    }
};
  
const modifyFileS3 = async (filePath, fileName, bucketName) => {
    const fileContentStream = fs.createReadStream(filePath);  
    const bucketHierarchy = await getBucketHierarchy(bucketName);
    
    let fileKey = '';
    if (bucketHierarchy.type == 'folder') {
      fileKey = await findFileDirectoryInBucket(bucketHierarchy, fileName);
    } else if (bucketHierarchy.type == 'file' && bucketHierarchy.name == fileName) {
      if (bucketHierarchy.path == '') {
        fileKey = fileName;
      } else {
        fileKey = bucketHierarchy.path;
      }
    }
    
    const s3Params = {
      Bucket: bucketName,
      Key: fileKey,
      Body: fileContentStream
    };
  
    try {
      await s3.send(new PutObjectCommand(s3Params));
      console.log('File:', fileName, 'modified on S3 bucket,', bucketName, '.');
    } catch (err) {
      console.log("Error uploading file", fileName, "to bucket, error:", err);
    }
};
  
const deleteFileS3 = async (fileName, bucketName) => {
    const bucketHierarchy = await getBucketHierarchy(bucketName);
    
    let fileKey = '';
    if (bucketHierarchy.type == 'folder') {
      fileKey = await findFileDirectoryInBucket(bucketHierarchy, fileName);
    } else if (bucketHierarchy.name == fileName) {
      fileKey = bucketHierarchy.path;
    }
    
    const s3Params = {
      Bucket: bucketName,
      Key: fileName
    };
  
    try {
      await s3.send(new DeleteObjectCommand(s3Params));
      console.log('File: ', fileName, ' deleted from S3 bucket, ', bucketName, '.');
    } catch (err) {
      console.log("Error deleting file", fileName, " from bucket, error: ", err);
    }
};

module.exports = {
    uploadFileToS3,
    modifyFileS3,
    deleteFileS3
};