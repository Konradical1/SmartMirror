import { spawn } from 'node:child_process';

const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error('Could not locate npm. Run this command through npm: npm run integrations');
  process.exit(1);
}

const processes = [
  {
    name: 'mirror-server',
    executable: process.execPath,
    args: [npmCli, '--prefix', 'mirror-server', 'run', 'dev'],
  },
  {
    name: 'mirror-ui',
    executable: process.execPath,
    args: [npmCli, 'run', 'dev'],
  },
];

const children = new Set();
let shuttingDown = false;

for (const processConfig of processes) {
  const child = spawn(processConfig.executable, processConfig.args, {
    stdio: 'inherit',
    env: process.env,
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`${processConfig.name} exited with ${signal || `code ${code}`}`);
      shutdown(code || 1);
    }
  });

  child.on('error', (error) => {
    console.error(`${processConfig.name} failed to start: ${error.message}`);
    shutdown(1);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    child.kill();
  }

  process.exitCode = exitCode;
}
