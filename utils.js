async function cloneCloudRepo(hierarchy, folderPath, bucketName) {
    const destinationPath = path.join(folderPath, hierarchy.name);
  
    if (hierarchy.type === 'file') {
      // Check if the file already exists at the destination
      if (!fs.existsSync(destinationPath)) {
        const localFilePath = await getFileContentFromS3(hierarchy.path, destinationPath, bucketName);
  
        // Create parent directories recursively
        const parentDir = path.dirname(localFilePath);
        await fs.promises.mkdir(parentDir, { recursive: true });
      }
    } else if (hierarchy.type === 'folder') {
      // Create the folder at the destination
      if (!fs.existsSync(destinationPath)) {
        await fs.promises.mkdir(destinationPath, { recursive: true });
      }
  
      // Recursively clone child files and folders
      for (const child of hierarchy.children) {
        await cloneCloudRepo(child, destinationPath, bucketName);
      }
    }
  }
  
  async function getFileContentFromS3(filePath, localFilePath, bucketName) {
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
  }
  
  async function getBucketHierarchyClone(bucketName) {
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
  }
  
  async function getActiveRepo(){
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
  }
  
  async function getLocalRepos(){
    const localRepos = [];
    const config = store.store;
    for (const key in config) {
      let obj = { uniqueName: '', friendlyName: '', organization: '', folderPath: '' };
      if (key !== 'activeRepo') {
        obj.uniqueName = key;
        obj.friendlyName = config[key].friendlyName;
        obj.organization = config[key].organization;
        obj.folderPath = config[key].folderPath;
        localRepos.push(obj);        
      }
    }
    return localRepos;
  }