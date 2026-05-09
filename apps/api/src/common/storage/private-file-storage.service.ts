import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { BlobServiceClient } from "@azure/storage-blob";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { EnvConfig } from "../../config/env.schema.js";

@Injectable()
export class PrivateFileStorageService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async writeImportFile(input: {
    filename?: string | null;
    stream: Readable;
    tenantId: string;
  }): Promise<{ byteSize: number; checksumSha256: string; storageKey: string }> {
    const storageKey = this.buildImportStorageKey(input.tenantId, input.filename);
    if (this.driver === "azure_blob") {
      const buffer = await this.readStreamToBuffer(input.stream);
      const checksumSha256 = createHash("sha256").update(buffer).digest("hex");
      await this.blobClient(storageKey).uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: "application/octet-stream" },
      });
      return {
        byteSize: buffer.byteLength,
        checksumSha256,
        storageKey,
      };
    }

    const filePath = this.resolve(storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });

    const hash = createHash("sha256");
    let byteSize = 0;
    const checksumStream = new Transform({
      transform(chunk: Buffer | string, _encoding, callback) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        byteSize += buffer.byteLength;
        hash.update(buffer);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(input.stream, checksumStream, createWriteStream(filePath, { flags: "wx" }));
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }

    return {
      byteSize,
      checksumSha256: hash.digest("hex"),
      storageKey,
    };
  }

  async read(storageKey: string): Promise<Readable> {
    if (this.driver === "azure_blob") {
      const response = await this.blobClient(storageKey).download();
      if (!response.readableStreamBody) {
        throw new Error("Blob download did not return a readable stream.");
      }
      return response.readableStreamBody as Readable;
    }
    return createReadStream(this.resolve(storageKey));
  }

  private get driver(): "azure_blob" | "local" {
    return this.config.get("PRIVATE_STORAGE_DRIVER", { infer: true });
  }

  private blobClient(storageKey: string) {
    const connectionString = this.config.get("AZURE_BLOB_CONNECTION_STRING", { infer: true });
    if (!connectionString) {
      throw new Error("AZURE_BLOB_CONNECTION_STRING is required for Azure Blob private storage.");
    }
    return BlobServiceClient.fromConnectionString(connectionString)
      .getContainerClient(this.config.get("AZURE_BLOB_CONTAINER_NAME", { infer: true }))
      .getBlockBlobClient(storageKey);
  }

  private async readStreamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private buildImportStorageKey(tenantId: string, filename?: string | null): string {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${tenantId}/imports/${year}/${month}/${randomUUID()}-${this.sanitizeFilename(filename)}`;
  }

  private sanitizeFilename(filename?: string | null): string {
    const fallback = "import-file";
    const normalized = path.basename(filename ?? fallback).replace(/[^a-zA-Z0-9._-]/g, "_");
    return normalized || fallback;
  }

  private resolve(storageKey: string): string {
    const root = path.resolve(this.config.get("PRIVATE_STORAGE_ROOT", { infer: true }));
    const resolved = path.resolve(root, storageKey);
    if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
      throw new Error("Invalid private storage key.");
    }
    return resolved;
  }
}
