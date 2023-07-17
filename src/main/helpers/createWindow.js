// electron app main process
const { BrowserWindow } = require('electron');

module.exports.createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        //autoHideMenuBar: true,
        icon: __dirname + '../../../renderer/assets/icons/icon.ico',
    });

    mainWindow.loadFile('./src/renderer/views/index.html');
};