import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createReadStream } from 'fs'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// 对象存储抽象：把本地视频文件上传到对象存储，返回供平台抓取的 URL（预签名/公开）
export interface VideoStorage {
  upload(localPath: string, key: string): Promise<string>
}

// S3 兼容对象存储实现（AWS S3 / 阿里云 OSS / 腾讯云 COS / 自建 MinIO 均可复用）。
// 上传视频后生成「预签名 GET URL」，供 Instagram 等平台在有效期内抓取视频。
@Injectable()
export class S3StorageService implements VideoStorage {
  private client: S3Client | null = null
  private bucket = ''
  private expires = 172800 // 预签名有效期默认 48h，覆盖 Instagram 24h 容器窗口

  constructor(private readonly env: ConfigService) {
    const endpoint = this.env.get<string>('STORAGE_ENDPOINT')
    const region = this.env.get<string>('STORAGE_REGION') || 'us-east-1'
    const accessKey = this.env.get<string>('STORAGE_ACCESS_KEY')
    const secretKey = this.env.get<string>('STORAGE_SECRET_KEY')
    this.bucket = this.env.get<string>('STORAGE_BUCKET') || ''

    const expires = Number(this.env.get<string>('STORAGE_URL_EXPIRES'))
    if (Number.isFinite(expires) && expires > 0) this.expires = expires

    if (endpoint && accessKey && secretKey && this.bucket) {
      this.client = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle: true, // OSS / COS / MinIO 需要 path-style 寻址
      })
    }
  }

  async upload(localPath: string, key: string): Promise<string> {
    if (!this.client) {
      throw new Error(
        '对象存储未配置，请设置 STORAGE_ENDPOINT / STORAGE_BUCKET / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY',
      )
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(localPath), // 流式上传，避免整文件进内存
        ContentType: 'video/mp4',
      }),
    )
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: this.expires,
    })
  }
}
