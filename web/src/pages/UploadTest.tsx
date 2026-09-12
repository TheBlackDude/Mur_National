import { useState } from 'react'
import { ensureAnonymousUser } from '../lib/firebase'
import { resumableUpload } from '../lib/upload'

/** Dev-only (/dev/upload): exercises the resumable uploader with a synthetic 3 MB clip under videos/XX/. */
export default function UploadTest() {
  const [log, setLog] = useState<string[]>([])
  const say = (m: string) => setLog((l) => [...l, `${new Date().toISOString().slice(11, 19)} ${m}`])
  async function run() {
    await ensureAnonymousUser()
    const bytes = new Uint8Array(3 * 1024 * 1024 + 12345)
    for (let i = 0; i < bytes.length; i += 4096) bytes[i] = i & 255
    const file = Object.assign(new Blob([bytes], { type: 'video/mp4' }), { name: 'test.mp4', lastModified: 1 })
    const up = resumableUpload({ path: `videos/XX/devtest-${Date.now()}.mp4`, file, contentType: 'video/mp4', onProgress: (s, t) => say(`progress ${s}/${t}`), onState: (st) => say(`state ${st}`) })
    try { const r = await up.done; say(`done ${r.path}`) } catch (e) { say(`error ${(e as Error).message}`) }
  }
  return <div className="grid gap-3"><button className="btn-primary w-fit" onClick={run}>Run upload test</button><pre className="text-xs card p-4 whitespace-pre-wrap" data-testid="log">{log.join('\n')}</pre></div>
}
