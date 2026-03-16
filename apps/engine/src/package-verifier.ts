/**
 * Package Verifier — 包签名和 Provenance 验证
 *
 * 验证包的数字签名和构建来源，为 Studio 提供信任级别判断。
 * 第一版采用简单的 manifest 字段检查，后续可接入真正的加密签名验证。
 */

export type SignatureStatus = 'valid' | 'invalid' | 'missing' | 'expired';
export type TrustLevel = 'official' | 'team' | 'third-party' | 'unverified';

export type VerificationResult = {
  trustLevel: TrustLevel;
  signatureStatus: SignatureStatus;
  signer?: string;
  signedAt?: number;
  provenanceValid: boolean;
  provenanceSource?: string;
  warnings: string[];
};

const OFFICIAL_SIGNERS = new Set(['kal-ai', 'kal-official']);

/**
 * 验证包的签名和来源信息
 */
export function verifyPackage(manifest: {
  id: string;
  author?: string;
  signature?: string;
  provenance?: string;
}): VerificationResult {
  const warnings: string[] = [];
  let signatureStatus: SignatureStatus = 'missing';
  let signer: string | undefined;
  let signedAt: number | undefined;
  let provenanceValid = false;
  let provenanceSource: string | undefined;

  // 签名验证（第一版：检查 manifest 中的 signature 字段）
  if (manifest.signature) {
    try {
      const parsed = JSON.parse(manifest.signature) as {
        signer?: string;
        signedAt?: number;
        hash?: string;
      };
      signer = parsed.signer;
      signedAt = parsed.signedAt;

      if (signer && parsed.hash) {
        signatureStatus = 'valid';
      } else {
        signatureStatus = 'invalid';
        warnings.push('签名格式不完整，缺少 signer 或 hash 字段');
      }

      if (signedAt && Date.now() - signedAt > 365 * 24 * 60 * 60 * 1000) {
        signatureStatus = 'expired';
        warnings.push('签名已过期（超过 1 年）');
      }
    } catch {
      signatureStatus = 'invalid';
      warnings.push('签名格式无法解析');
    }
  } else {
    warnings.push('包未签名');
  }

  // Provenance 验证
  if (manifest.provenance) {
    try {
      const parsed = JSON.parse(manifest.provenance) as {
        source?: string;
        buildId?: string;
        repository?: string;
      };
      provenanceSource = parsed.source;
      provenanceValid = !!(parsed.source && parsed.buildId);

      if (!provenanceValid) {
        warnings.push('Provenance 信息不完整');
      }
    } catch {
      warnings.push('Provenance 格式无法解析');
    }
  }

  // 信任级别判断
  let trustLevel: TrustLevel = 'unverified';

  if (signatureStatus === 'valid' && signer && OFFICIAL_SIGNERS.has(signer)) {
    trustLevel = 'official';
  } else if (signatureStatus === 'valid' && signer) {
    trustLevel = 'team';
  } else if (manifest.author || provenanceValid) {
    trustLevel = 'third-party';
  }

  if (trustLevel === 'unverified') {
    warnings.push('无法验证包的来源，请谨慎安装');
  }

  return {
    trustLevel,
    signatureStatus,
    signer,
    signedAt,
    provenanceValid,
    provenanceSource,
    warnings,
  };
}
