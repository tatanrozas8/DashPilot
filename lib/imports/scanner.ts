import type { ImportValidationIssue } from "@/types/imports";

export interface MalwareScanTarget {
  storageBucket: string;
  storagePath: string;
  fileName: string;
  sizeBytes: number;
}

export interface MalwareScanResult {
  provider: string;
  status: "clean" | "infected" | "failed";
  signature?: string;
  scannedAt: string;
  issue?: ImportValidationIssue;
}

export interface MalwareScanner {
  readonly provider: string;
  scan(target: MalwareScanTarget): Promise<MalwareScanResult>;
}

export function createUnavailableScanner(provider = "unconfigured-antivirus"): MalwareScanner {
  return {
    provider,
    async scan(target) {
      return {
        provider,
        status: "failed",
        scannedAt: new Date().toISOString(),
        issue: {
          code: "virus_detected",
          severity: "error",
          message: `No hay scanner antivirus configurado para ${target.fileName}.`
        }
      };
    }
  };
}

export function createCleanScanner(provider = "test-clean-scanner"): MalwareScanner {
  return {
    provider,
    async scan() {
      return {
        provider,
        status: "clean",
        scannedAt: new Date().toISOString()
      };
    }
  };
}

export function createInfectedScanner(signature: string, provider = "test-infected-scanner"): MalwareScanner {
  return {
    provider,
    async scan() {
      return {
        provider,
        status: "infected",
        signature,
        scannedAt: new Date().toISOString(),
        issue: {
          code: "virus_detected",
          severity: "error",
          message: `El scanner ${provider} detecto ${signature}.`
        }
      };
    }
  };
}
