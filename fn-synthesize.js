const { adaptVercel } = require('./yc-adapter');
module.exports.handler = adaptVercel(require('./api/synthesize'));
