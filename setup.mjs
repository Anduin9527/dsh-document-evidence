#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const storage = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'data', 'document-evidence')
const venv = join(storage, 'python')
const python = join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true })
  if (result.error || result.status !== 0) throw new Error(`${command} failed. Python 3.10+ with venv support is required. ${result.error?.message ?? ''}`)
}
try {
  mkdirSync(storage, { recursive: true })
  const launcher = process.env.PDF_EVIDENCE_SETUP_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
  run(launcher, ['-m', 'venv', venv])
  run(python, ['-m', 'pip', 'install', '-r', fileURLToPath(new URL('./requirements.txt', import.meta.url))])
  run(python, ['-c', 'import pymupdf; print("PyMuPDF", pymupdf.VersionBind)'])
  console.log(`PDF runtime ready: ${python}\nRestart dsh web. No additional API key is needed.`)
} catch (error) { console.error(error.message); process.exitCode = 1 }
