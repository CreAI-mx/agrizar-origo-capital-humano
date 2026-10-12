// Starts the API and the web client together for local development.
import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'dev', '-w', 'modules/CapitalHumano'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', 'app'], { stdio: 'inherit' }),
];
const stop = () => children.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((child) => child.on('exit', stop));
