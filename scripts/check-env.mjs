import { spawnSync } from 'node:child_process';

const commands = [
  { name: 'Node.js 24', command: process.execPath, args: ['--version'], validate: (value) => /^v24\./.test(value) },
  { name: 'pnpm', command: 'pnpm', args: ['--version'], validate: () => true },
  { name: 'Python 3.11', command: 'python3.11', args: ['--version'], validate: (value) => /Python 3\.11\./.test(value) },
  { name: 'FFmpeg', command: 'ffmpeg', args: ['-version'], validate: (value) => /^ffmpeg version/m.test(value) },
  { name: 'ffprobe', command: 'ffprobe', args: ['-version'], validate: (value) => /^ffprobe version/m.test(value) },
];

let failed = false;

for (const item of commands) {
  const result = spawnSync(item.command, item.args, { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const valid = result.status === 0 && item.validate(output);
  console.log(`${valid ? 'ok' : 'missing'}  ${item.name}${output ? `  ${output.split('\n')[0]}` : ''}`);
  failed ||= !valid;
}

process.exitCode = failed ? 1 : 0;

