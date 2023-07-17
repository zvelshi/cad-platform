const { s3 } = require('../../services/aws/s3_client.js');
const crypto = require('crypto');
const fs = require('fs');

const { GetObjectCommand } = require('@aws-sdk/client-s3');

const calculateCloudFileHash = async (bucketName, filePath) => {
    const params = {
      Bucket: bucketName,
      Key: filePath,
    };
  
    try {
      const data = await s3.send(new GetObjectCommand(params));
      const stream = data.Body;
  
      return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
  
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
      });
    } catch (err) {
      console.error('Error calculating file hash:', err);
      return null;
    }
}

const calculateLocalFileHash = async (filePath) => {
  
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
  
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
}

module.exports = {
  calculateCloudFileHash,
  calculateLocalFileHash
};