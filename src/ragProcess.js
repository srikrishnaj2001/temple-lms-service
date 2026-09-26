'use strict';

const path = require('path');
const { spawn } = require('child_process');

const RAG_DIR = path.join(__dirname, '..', 'lms-rag');
const RAG_ENTRY = path.join(RAG_DIR, 'apps', 'api', 'dist', 'server.js');
const RAG_INTERNAL_PORT = process.env.RAG_INTERNAL_PORT || 3100;

let child = null;

function startRagProcess() {
  if (process.env.RAG_DISABLED === '1') {
    console.log('[rag] RAG_DISABLED=1, skipping lms-rag process');
    return;
  }

  child = spawn(process.execPath, [RAG_ENTRY], {
    cwd: RAG_DIR,
    env: { ...process.env, API_PORT: String(RAG_INTERNAL_PORT), API_HOST: '127.0.0.1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  child.on('exit', (code, signal) => {
    console.error(`[rag] process exited (code=${code}, signal=${signal}); restarting in 3s`);
    child = null;
    setTimeout(startRagProcess, 3000);
  });

  child.on('error', (err) => {
    console.error('[rag] failed to start process:', err);
  });

  console.log(`[rag] started lms-rag (pid ${child.pid}) on internal port ${RAG_INTERNAL_PORT}`);
}

function stopRagProcess() {
  if (child) child.kill('SIGTERM');
}

module.exports = { startRagProcess, stopRagProcess };
