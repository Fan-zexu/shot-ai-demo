import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const detached = process.platform !== 'win32';
const services = [
  { name: 'Pose Worker', script: 'worker:dev', url: 'http://127.0.0.1:8001' },
  { name: 'API', script: 'api:dev', url: 'http://127.0.0.1:3001' },
  { name: 'H5', script: 'web:dev', url: 'http://127.0.0.1:5173' },
];

let stopping = false;
const children = services.map((service) => {
  console.log(`[dev] starting ${service.name}: ${service.url}`);
  const child = spawn(packageManager, ['run', service.script], {
    cwd: repositoryRoot,
    detached,
    env: process.env,
    stdio: 'inherit',
  });
  child.once('error', (error) => {
    console.error(`[dev] ${service.name} failed to start: ${error.message}`);
    shutdown(1);
  });
  child.once('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[dev] ${service.name} stopped (${signal ?? `exit ${code ?? 1}`})`);
    shutdown(code && code > 0 ? code : 1);
  });
  return child;
});

function stopChild(child, signal) {
  if (!child.pid) return;
  try {
    if (detached) process.kill(-child.pid, signal);
    else if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function childGroupIsAlive(child) {
  if (!child.pid) return false;
  if (!detached) return child.exitCode === null && child.signalCode === null;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

function shutdown(exitCode) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) stopChild(child, 'SIGTERM');

  // pnpm can exit before its Vite, Uvicorn, or tsx descendants. Poll the whole
  // process group, not only the direct ChildProcess handle, before exiting.
  const deadline = Date.now() + 3_000;
  const waitForGroups = () => {
    if (children.every((child) => !childGroupIsAlive(child))) {
      process.exit(exitCode);
    }
    if (Date.now() >= deadline) {
      for (const child of children) stopChild(child, 'SIGKILL');
      setTimeout(() => process.exit(exitCode), 100);
      return;
    }
    setTimeout(waitForGroups, 100);
  };
  setTimeout(waitForGroups, 50);
}

// pnpm and the terminal can both forward the same shutdown signal. Keep the
// handlers installed so a duplicate signal cannot restore Node's default exit
// before descendant process groups have been reaped.
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
