import { copyFileSync, constants, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Please use Node.js 24.x.'); process.exit(1);
}
function run(folder, args) {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    cwd: resolve(root, folder), stdio: 'inherit', shell: process.platform === 'win32'
  });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function config(folder, name) {
  const destination = resolve(root, folder, name);
  if (!existsSync(destination)) {
    copyFileSync(resolve(root, folder, '.env.example'), destination, constants.COPYFILE_EXCL);
    console.log('Created ' + folder + '/' + name);
  } else console.log('Kept existing ' + folder + '/' + name);
}
switch (process.argv[2]) {
  case 'setup':
    config('backend', '.env'); config('frontend', '.env.local');
    run('backend', ['install', '--frozen-lockfile']);
    run('frontend', ['install', '--frozen-lockfile']);
    console.log('Ready. Open two terminals: pnpm dev:backend / pnpm dev:frontend');
    break;
  case 'backend': run('backend', ['start']); break;
  case 'frontend': run('frontend', ['dev']); break;
  case 'check':
    for (const folder of ['backend', 'frontend']) {
      run(folder, ['test']); run(folder, ['build']);
    }
    break;
  default: console.error('Usage: node scripts/project.mjs setup|backend|frontend|check'); process.exit(1);
}

