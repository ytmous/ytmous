// This is the restarter script of ytmous server
// To stop the memory leak effect.

const { spawn } = require("child_process");
const os = require("os");

function run() {
  // In MB
  this.freemem = Math.round(os.freemem() / 1024 / 1024);
  this.limit = process.env.MAX_SPACE_SIZE || Math.floor(this.freemem / 1.2);

  console.log((new Date()).toLocaleString(), "Starting process.");
  console.log((new Date()).toLocaleString(), "Limiting memory to", this.limit, "MB");

  let node = spawn("node", ["--max_old_space_size=" + this.limit, "server.js"], { 
    stdio: "inherit"
  });

  node.on('exit', (c) => {
    console.log((new Date()).toLocaleString(), "Process exited with code", c);
    run();
  });
}

console.log("Restarter initialized.");
console.log("To change memory limit in your own,");
console.log("Set MAX_SPACE_SIZE environment variable in MB.\n");

run();
