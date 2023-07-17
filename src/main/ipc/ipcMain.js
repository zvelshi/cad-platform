/*
* File Name: 
* Date Created: 2023-07-13
* Last Modified: 2023-07-13
* Purpose:
* Inputs:
* Outputs:
*/

const { dialog } = require('electron');
const { s3 } = require('../../services/aws/s3_client.js');
const { dbdoc } = require('../../services/aws/db_client.js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const {
  CreateBucketCommand,
} = require('@aws-sdk/client-s3');

const { 
  PutCommand, 
  GetCommand, 
} = require('@aws-sdk/lib-dynamodb');

const Store = require('electron-store');
const store = new Store();

const { 
    getActiveRepoCloud, 
    getActiveRepoLocal 
} = require('../helpers/getActiveRepo.js');

const { 
    checkLocalDirectory 
} = require('../helpers/checkLocalDirectory.js');

const { 
    getLocalRepos,
    getCloudRepos
} = require('../helpers/getReposList.js');

const {
    getBucketHierarchy, 
    getLocalHierarchy
} = require('../helpers/fileHierarchy.js');

const {
    cloneLocalRepo,
    cloneCloudRepo
} = require('../helpers/cloneRepo.js');

const {
    alertDialog
} = require('../helpers/misc.js');

const {
    pullCloudRepo
} = require('../helpers/pullCloudRepo.js');

const {
    uploadFileToS3,
    modifyFileS3,
    deleteFileS3
} = require('../helpers/modifyS3File.js');

const handleOpenFolderDialog = async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (!result.canceled) {
        return result.filePaths[0];
    } else {
        return null;
    }
};

const handleCreateRepo = async (event, repoData) => {
    const {
        folderPath,
        friendlyName,
        organization
    } = repoData;
    const uniqueName = uuidv4();

    store.set(uniqueName, {
        friendlyName,
        organization,
        folderPath
    });

    try {
        await dbdoc.send(new PutCommand({
            TableName: 'repositories',
            Item: {
                id: uniqueName,
                friendlyName,
                organization,
            }
        }));
    } catch (err) {
        console.log(err);
    }

    const s3Params = {
        Bucket: uniqueName,
        ACL: 'private'
    };

    try {
        await s3.send(new CreateBucketCommand(s3Params));
    } catch (err) {
        console.log(err);
    }

    fs.mkdirSync(folderPath);

    store.set('activeRepo', uniqueName);
};

const handleGetActiveRepoCloud = async (event) => {
    return await getActiveRepoCloud();
};

const handleGetActiveRepoLocal = async (event) => {
    return await getActiveRepoLocal();
};

const handleSetActiveRepo = async (event, uniqueName) => {
    store.set('activeRepo', uniqueName);
};

const handleGetLocalRepos = async (event) => {
    return await getLocalRepos();
};

const handleGetCloudRepos = async (event) => {
    return await getCloudRepos();
};

const handleCloneRepo = async (event, repoUniqueName, folderPathWithoutFName) => {
    const res = await dbdoc.send(new GetCommand({
        TableName: 'repositories',
        Key: {
            id: repoUniqueName,
        }
    }));

    const repoData = {
        uniqueName: repoUniqueName,
        friendlyName: res.Item.friendlyName,
        organization: res.Item.organization,
        folderPath: folderPathWithoutFName
    }

    store.set(repoUniqueName, {
        friendlyName: repoData.friendlyName,
        organization: repoData.organization,
        folderPath: repoData.folderPath + '/' + repoData.friendlyName
    });

    const hierarchy = await getBucketHierarchy(repoData.uniqueName);
    await cloneCloudRepo(hierarchy, repoData.folderPath, repoData.uniqueName);

    store.set('activeRepo', repoUniqueName);

    await alertDialog('Clone Complete', 'The repository has been cloned successfully.', ['OK']);
};

const handlePullRepo = async (event) => {
    const activeRepo = await getActiveRepoLocal();
    const hierarchy = await getBucketHierarchy(activeRepo.uniqueName);
    const folderPath = activeRepo.folderPath.slice(0, activeRepo.folderPath.lastIndexOf('\\'));

    await pullCloudRepo(hierarchy, folderPath, activeRepo.uniqueName);

    await alertDialog('Pull Complete', 'The repository has been pulled successfully.', ['OK']);
};

const handleCloneLocalRepo = async (event, repoData) => {
    const uniqueName = uuidv4();

    store.set(uniqueName, {
        friendlyName: repoData.friendlyName,
        organization: repoData.organization,
        folderPath: repoData.folderPath
    });

    store.set('activeRepo', uniqueName);

    try {
        await dbdoc.send(new PutCommand({
            TableName: 'repositories',
            Item: {
                id: uniqueName,
                friendlyName: repoData.friendlyName,
                organization: repoData.organization,
            }
        }));
    } catch (err) {
        console.log(err);
    }

    const s3Params = {
        Bucket: uniqueName,
        ACL: 'private'
    };

    try {
        await s3.send(new CreateBucketCommand(s3Params));
    } catch (err) {
        console.log(err);
    }

    const hierarchy = await getLocalHierarchy(repoData.folderPath);
    await cloneLocalRepo(uniqueName, repoData.folderPath, hierarchy);

    await alertDialog('Clone Complete', 'The repository has been cloned successfully.', ['OK']);
};

const handleCheckLocalDirectory = async (event, activeRepo) => {
    return await checkLocalDirectory(activeRepo);
};

const handlePushChanges = async (event, selectedFiles) => {
    const activeRepo = await getActiveRepoLocal();
    const diffResult = await checkLocalDirectory(activeRepo);

    const addedFiles = diffResult.newFiles;
    const modifiedFiles = diffResult.modifiedFiles;
    const deletedFiles = diffResult.deletedFiles;

    try {
        for (const filePath of addedFiles) {
            if (selectedFiles.New.includes(filePath)) {
                const fileName = filePath.slice(filePath.lastIndexOf('\\') + 1);
                console.log(filePath, ":", fileName, ":", activeRepo.uniqueName)
                await uploadFileToS3(filePath, fileName, activeRepo.uniqueName);
            }
        }
    } catch (err) {
        console.log(err);
    }

    try {
        for (const filePath of modifiedFiles) {
            if (selectedFiles.Modified.includes(filePath)) {
                const fileName = filePath.slice(filePath.lastIndexOf('\\') + 1);
                await modifyFileS3(filePath, fileName, activeRepo.uniqueName);
            }
        }
    } catch (err) {
        console.log(err);
    }

    try {
        for (const filePath of deletedFiles) {
            if (selectedFiles.Deleted.includes(filePath)) {
                await deleteFileS3(filePath, activeRepo.uniqueName);
            }
        }
    } catch (err) {
        console.log(err);
    }

    // Refresh the diff result after the push
    const updatedDiffResult = await checkLocalDirectory(activeRepo);
    mainWindow.webContents.send('update-list', updatedDiffResult);

    // Alert the user that the push was successful
    await alertDialog('Push Complete', 'The repository has been pushed successfully.', ['OK']);

    return activeRepo;
};

module.exports = {
    handleOpenFolderDialog,
    handleCreateRepo,
    handleGetActiveRepoCloud,
    handleGetActiveRepoLocal,
    handleSetActiveRepo,
    handleGetLocalRepos,
    handleGetCloudRepos,
    handleCloneRepo,
    handlePullRepo,
    handleCloneLocalRepo,
    handleCheckLocalDirectory,
    handlePushChanges
};