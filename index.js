// This is the restarter script of ytmous server
// To stop the memory leak effect.

const { spawn } = require("child_process");
const os = require("os");

function run() {
  // In MB
  let freemem = Math.round(os.freemem() / 1024 / 1024);
  let limit = process.env.MAX_SPACE_SIZE || Math.floor(freemem / 1.2);

  console.log((new Date()).toLocaleString(), "Starting process.");
  console.log((new Date()).toLocaleString(), "Limiting memory to", limit, "MB");

  let node = spawn("node", ["--max-old-space-size=" + limit, "server.js"], {
    stdio: "inherit",
    env: {
      MAX_SPACE_SIZE: limit,
      ...process.env
    }
  });

  node.on('exit', (c) => {
    console.log((new Date()).toLocaleString(), "Process exited with code", c);
    run();
  });
}

console.log("Restarter initialized.");
console.log("To change memory limit in your own,");
console.log("Set MAX_SPACE_SIZE environment variable in MB.\n");

console.log(`
      ytmous - Anonymous Youtube Proxy
  ....There we go back and forth again....
`);

run();
