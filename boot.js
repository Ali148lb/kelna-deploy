'use strict';
// Entry point. On hosts with an ephemeral disk (Render free plan) the SQLite file is
// restored from an S3-compatible bucket at startup and backed up whenever data changes.
const fs = require('fs'), E = process.env, KEY = 'kelna.db', DB = E.DB_PATH || 'data.db';
const enabled = !!(E.S3_BUCKET && E.S3_KEY_ID && E.S3_SECRET && E.S3_ENDPOINT);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let s3, Put;
  if (enabled) {
    const sdk = require('@aws-sdk/client-s3'); Put = sdk.PutObjectCommand;
    s3 = new sdk.S3Client({ region: E.S3_REGION || 'auto', endpoint: E.S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: E.S3_KEY_ID, secretAccessKey: E.S3_SECRET }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
    try {
      const r = await s3.send(new sdk.GetObjectCommand({ Bucket: E.S3_BUCKET, Key: KEY }));
      for (const x of ['', '-wal', '-shm']) fs.rmSync(DB + x, { force: true });
      fs.writeFileSync(DB, Buffer.from(await r.Body.transformToByteArray())); console.log('Database restored from backup');
    } catch (e) {
      // Only a missing backup means "first run". Any other error must stop startup, otherwise an empty DB could overwrite a good backup.
      if (e.name !== 'NoSuchKey' && e.$metadata?.httpStatusCode !== 404) throw e;
      console.log('No backup found, starting fresh');
    }
  } else console.warn('S3 backup is OFF: data is lost on restart when the disk is ephemeral.');
  require('./server');
  if (!enabled) return;
  const { db } = require('./db'); let last = -1, busy = false;
  const flush = async () => {
    if (busy) return; busy = true;
    try {
      const n = db.prepare('SELECT total_changes() n').get().n; if (n === last) return;
      const tmp = DB + '.snap'; fs.rmSync(tmp, { force: true }); db.exec(`VACUUM INTO '${tmp}'`); // consistent snapshot
      await s3.send(new Put({ Bucket: E.S3_BUCKET, Key: KEY, Body: fs.readFileSync(tmp) })); fs.rmSync(tmp, { force: true }); last = n;
    } catch (e) { console.error('Backup failed:', e.message); } finally { busy = false; }
  };
  setInterval(flush, 20000);
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, async () => { while (busy) await sleep(100); await flush(); process.exit(0); });
})().catch(e => { console.error(e); process.exit(1); });
