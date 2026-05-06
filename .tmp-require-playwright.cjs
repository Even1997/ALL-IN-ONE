process.env.NODE_PATH = "C:\\Users\\Even\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
require("module").Module._initPaths();
const mod = require("playwright");
console.log("OK", typeof mod.chromium);
