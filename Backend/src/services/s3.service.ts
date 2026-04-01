import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env';
import { ApiError } from '../utils/ApiError';

export class S3Service {
  private static client: S3Client | null = null;
  private static bucket: string;
  private static cloudFrontDomain: string;

  static initialize() {
    if (!this.client) {
      this.client = new S3Client({
        region: config.aws.region,
        credentials: {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey,
        },
      });
      this.bucket = config.aws.s3Bucket;
      this.cloudFrontDomain = config.aws.cloudFrontDomain;
    }
  }

  static async uploadFile(
    buffer: Buffer,
    key: string,
    contentType?: string
  ): Promise<string> {
    this.initialize();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    });

    await this.client!.send(command);
    return this.getCloudFrontUrl(key);
  }

  static async objectExists(key: string): Promise<boolean> {
    this.initialize();
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    try {
      await this.client!.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: cleanKey })
      );
      return true;
    } catch (e: unknown) {
      const err = e as { $metadata?: { httpStatusCode?: number }; name?: string; Code?: string };
      if (err?.$metadata?.httpStatusCode === 404) return false;
      const code = err?.Code || err?.name;
      if (code === 'NotFound' || code === 'NoSuchKey') return false;
      throw e;
    }
  }

  static async deleteFile(key: string): Promise<boolean> {
    try {
      this.initialize();

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client!.send(command);
      return true;
    } catch (error) {
      console.error(`Error deleting file from S3: ${key}`, error);
      return false;
    }
  }

  static getCloudFrontUrl(key: string): string {
    this.initialize();
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    return `${this.cloudFrontDomain}/${cleanKey}`;
  }

  static extractS3Key(url: string): string {
    this.initialize();
    
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const urlObj = new URL(url);
      return urlObj.pathname.startsWith('/') 
        ? urlObj.pathname.substring(1) 
        : urlObj.pathname;
    }
    
    if (url.startsWith('/uploads/')) {
      return url.substring(1);
    }
    
    return url;
  }

  static async getObjectBuffer(keyOrUrl: string): Promise<{ buffer: Buffer; contentType: string | undefined }> {
    this.initialize();
    const key = this.extractS3Key(keyOrUrl);
    try {
      const out = await this.client!.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      const body = out.Body;
      if (!body) {
        console.error('[S3] getObjectBuffer missing Body on successful response', { bucket: this.bucket, key });
        throw new ApiError(503, 'Transcription service is temporarily unavailable. Please try again later.');
      }
      const chunks: Uint8Array[] = [];
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      return { buffer, contentType: out.ContentType ?? undefined };
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        console.error('[S3] getObjectBuffer ApiError', {
          bucket: this.bucket,
          key,
          statusCode: e.statusCode,
          message: e.message,
        });
        throw e;
      }
      const err = e as {
        name?: string;
        message?: string;
        $metadata?: { httpStatusCode?: number; requestId?: string };
        Code?: string;
      };
      const code = err.Code || err.name;
      const status = err.$metadata?.httpStatusCode;
      const requestId = err.$metadata?.requestId;
      if (status === 404 || code === 'NoSuchKey' || code === 'NotFound') {
        console.error('[S3] getObjectBuffer object missing', { bucket: this.bucket, key, code, status, requestId, message: err.message });
        throw new ApiError(404, 'Audio file not found');
      }
      if (status === 403 || code === 'AccessDenied') {
        console.error('[S3] getObjectBuffer access denied', { bucket: this.bucket, key, code, status, requestId, message: err.message });
        throw new ApiError(503, 'Transcription service is temporarily unavailable. Please try again later.');
      }
      console.error('[S3] getObjectBuffer failed', {
        bucket: this.bucket,
        key,
        code,
        status,
        requestId,
        message: err.message,
        errorName: err.name,
        raw: e,
      });
      throw new ApiError(503, 'Transcription service is temporarily unavailable. Please try again later.');
    }
  }
}
