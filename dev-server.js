const { spawn } = require('child_process');

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const host = String(process.env.FRONTEND_HOST || '0.0.0.0');
const port = String(process.env.FRONTEND_PORT || '3000');

const child = spawn(command, ['live-server', `--port=${port}`, `--host=${host}`], {
    stdio: 'inherit'
});

child.on('exit', (code) => {
    process.exit(code ?? 0);
});
