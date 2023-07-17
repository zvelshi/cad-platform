const findFileDirectoryInBucket = async (bucketHierarchy, fileName) => {
    let fileKey = '';
    if (bucketHierarchy.type == 'folder') {
      try {
        for (const child of bucketHierarchy.children) {
          fileKey = await findFileDirectoryInBucket(child, fileName);
          if (fileKey != '') {
            break;
          }
        }
      } catch (err) { 
        console.log(err); 
      }
    } else if (bucketHierarchy.type == 'file' && bucketHierarchy.name == fileName) {
      fileKey = bucketHierarchy.path;
    }
    return fileKey;
};

module.exports = { 
    findFileDirectoryInBucket 
};