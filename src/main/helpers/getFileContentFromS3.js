const { s3 } = require('../../services/aws/s3_client.js');

const fs = require('fs');

const { GetObjectCommand } = require('@aws-sdk/client-s3');

const getFileContentFromS3 = async (filePath, localFilePath, bucketName) => {
    const params = {
      Bucket: bucketName,
      Key: filePath,
    };
  
    try {
      const data = await s3.send(new GetObjectCommand(params));
      const stream = data.Body;
  
      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(localFilePath);
  
        stream.pipe(fileStream);
  
        stream.on('end', resolve);
        stream.on('error', reject);
      });
  
      return localFilePath;
    } catch (err) {
      console.error('Error getting file content from S3:', err);
      return null;
    }  
};

module.exports = {
    getFileContentFromS3
};