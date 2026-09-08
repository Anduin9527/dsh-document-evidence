import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const worker = fileURLToPath(new URL('./python/worker.py', import.meta.url))

/** Fixed executable + argv, JSON stdin. No shell; cancellation waits for child exit. */
export function runWorker(config, operation, args, signal) {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(config.python, [worker], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const stdout = []
    let stderr = '', size = 0, failure, killTimer
    const stop = (error) => {
      if (failure) return
      failure = error
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1000)
      killTimer.unref()
    }
    const abort = () => stop(signal.reason ?? new Error('Document tool cancelled'))
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const timer = setTimeout(() => stop(new Error('Document tool timed out')), config.timeoutMs)
    child.stdout.on('data', chunk => {
      size += chunk.length
      if (size > config.maxOutputBytes) stop(new Error('Worker output exceeds maxOutputBytes'))
      else stdout.push(chunk)
    })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000) })
    child.on('error', error => { failure = error })
    child.stdin.on('error', error => { if (!failure) failure = error })
    child.on('close', code => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      signal?.removeEventListener('abort', abort)
      if (failure) return reject(failure)
      if (code !== 0) return reject(new Error(stderr.includes("No module named 'pymupdf'")
        ? 'PDF runtime needs PyMuPDF. Run: dsh plugin --profile web exec dsh-document-evidence-setup, then restart dsh web.'
        : stderr.trim() || `PDF worker exited with code ${code}`))
      try { resolve(JSON.parse(Buffer.concat(stdout).toString('utf8'))) }
      catch { reject(new Error('PDF worker returned invalid JSON')) }
    })
    child.stdin.end(JSON.stringify({ config, operation, args }))
  })
}
