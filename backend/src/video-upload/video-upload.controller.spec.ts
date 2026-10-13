import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request = require('supertest')
import { createHash } from 'crypto'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve, sep } from 'path'
import { VideoUploadController } from './video-upload.controller'
import { VideoUploadService, CHUNK_SIZE } from './video-upload.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

describe('video upload HTTP multipart boundaries', () => {
  let app: INestApplication
  let root: string
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'video-http-test-'))
    const service = new VideoUploadService(); (service as any).root = root
    const module = await Test.createTestingModule({ controllers: [VideoUploadController], providers: [{ provide: VideoUploadService, useValue: service }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: ctx => { ctx.switchToHttp().getRequest().user = { userId: 1 }; return true } }).compile()
    app = module.createNestApplication()
    await app.init()
  })
  afterAll(async () => {
    await app.close()
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes('video-http-test-')) throw new Error('unsafe path')
    rmSync(root, { recursive: true, force: true })
  })
  it('accepts an exact 5 MB chunk, rejects truncation, and merges idempotently over HTTP', async () => {
    const blob = Buffer.alloc(CHUNK_SIZE, 23)
    const chunkHashes = [createHash('sha256').update(blob).digest('hex')]
    const uploadId = createHash('sha256').update(chunkHashes.join('')).digest('hex')
    const data = { uploadId, chunkHashes, fileName: 'http-test.mp4', fileSize: blob.length }
    await request(app.getHttpServer()).post('/video-upload/session').send(data).expect(201)
    await request(app.getHttpServer()).post(`/video-upload/chunk?uploadId=${uploadId}&chunkIndex=0`).attach('file', blob.subarray(0, 100), 'chunk_0').expect(400)
    await request(app.getHttpServer()).post(`/video-upload/chunk?uploadId=${uploadId}&chunkIndex=0`).attach('file', blob, 'chunk_0').expect(201)
    const first = await request(app.getHttpServer()).post('/video-upload/merge').send({ uploadId }).expect(201)
    const retry = await request(app.getHttpServer()).post('/video-upload/merge').send({ uploadId }).expect(201)
    expect(retry.body.data).toEqual(first.body.data)
    const resumed = await request(app.getHttpServer()).post('/video-upload/session').send(data).expect(201)
    expect(resumed.body.data.result.filename).toBe(first.body.data.filename)
  })
})
