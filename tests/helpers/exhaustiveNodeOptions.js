const path = require('node:path');

// One exact representation shared by the launcher and its preload. Only these
// harness options may be consumed after the subprocess guard captures them.
function buildDescendantNodeOptions(existingNodeOptions = '') {
    const preservedFlags = ['--preserve-symlinks', '--preserve-symlinks-main']
        .filter(flag => String(existingNodeOptions).split(/\s+/).includes(flag));
    const tripwirePath = path.join(__dirname, 'exhaustiveNetworkTripwire.js')
        .replace(/\\/g, '/').replace(/"/g, '\\"');
    return [`--require="${tripwirePath}"`, ...preservedFlags].join(' ');
}

module.exports = { buildDescendantNodeOptions };
