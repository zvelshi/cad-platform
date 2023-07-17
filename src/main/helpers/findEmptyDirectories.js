const path = require('path');
const fs = require('fs');

const findEmptyDirectories = async (folderPath) => {
  const dirents = await fs.promises.readdir(folderPath, { withFileTypes: true });
  const emptyDirs = [];

  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      const dirPath = path.join(folderPath, dirent.name).replace(/\\/g, '/');
      const subDirs = await findEmptyDirectories(dirPath);
      if (subDirs.length === 0) {
        emptyDirs.push(dirPath);
      } else {
        emptyDirs.push(...subDirs);
      }
    }
  }

  return emptyDirs;
};

module.exports = {
  findEmptyDirectories,
};