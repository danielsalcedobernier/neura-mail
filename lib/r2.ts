import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import sql from './db'

let r2Client: S3Client | null = null

async function getR2Config() {
  const rows = await sql`
    SELECT credentials, extra_config FROM api_connections 
    WHERE service_name = 'cloudflare_r2' AND is_active = true
  `
  if (!rows[0]) throw new Error('Cloudflare R2 not configured')
  return {
    creds: rows[0].credentials as Record<string, string>,
    config: rows[0].extra_config as Record<string, string>,
  }
}

async function getClient(): Promise<{ client: S3Client; bucket: string }> {
  const { creds, config } = await getR2Config()
  const client = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: creds.access_key_id,
      secretAccessKey: creds.secret_access_key,
    },
  })
  return { client, bucket: creds.bucket_name }
}

export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  const { client, bucket } = await getClient()
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))
  const { creds } = await getR2Config()
  return `${creds.public_url}/${key}`
}

export async function getPresignedUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
  const { client, bucket } = await getClient()
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType })
  return getSignedUrl(client, command, { expiresIn })
}

export async function getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const { client, bucket } = await getClient()
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  return getSignedUrl(client, command, { expiresIn })
}

export async function deleteFile(key: string): Promise<void> {
  const { client, bucket } = await getClient()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export function generateFileKey(userId: string, fileName: string): string {
  const timestamp = Date.now()
  const ext = fileName.split('.').pop()
  return `uploads/${userId}/${timestamp}-${Math.random().toString(36).slice(2)}.${ext}`
}
