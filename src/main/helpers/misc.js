const {dialog } = require('electron');

const alertDialog = async (title, message, buttons) => {
    const options = {
      type: 'info',
      title: title,
      message: message,
      buttons: buttons
    };
    dialog.showMessageBoxSync(null, options);
};

module.exports = {
    alertDialog
};