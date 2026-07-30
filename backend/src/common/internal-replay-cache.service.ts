import { Injectable } from "@nestjs/common";
import { getInternalReplayCacheMaxEntries } from "./security-config";

export type ReplayCacheResult = "ACCEPTED" | "REPLAY" | "FULL";

@Injectable()
export class InternalReplayCacheService {
  private readonly nonces = new Map<string, number>();

  consume(key: string, now: number, expiresAt: number): ReplayCacheResult {
    for (const [storedKey, storedExpiry] of this.nonces) {
      if (storedExpiry <= now) {
        this.nonces.delete(storedKey);
      }
    }

    if (this.nonces.has(key)) {
      return "REPLAY";
    }

    if (this.nonces.size >= getInternalReplayCacheMaxEntries()) {
      return "FULL";
    }

    this.nonces.set(key, expiresAt);
    return "ACCEPTED";
  }

  clear() {
    this.nonces.clear();
  }

  size() {
    return this.nonces.size;
  }
}
