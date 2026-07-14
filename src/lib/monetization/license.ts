import {
  verifyProLicenseToken,
  type LicenseTokenVerification,
  type ProLicenseClaims,
  type VerifyLicenseTokenDependencies,
} from "./license-token";

export const PRO_LICENSE_STORAGE_KEY = "stage7:pro-license";

export type StoredProLicense = {
  version: 1;
  token: string;
  claims: ProLicenseClaims;
  activatedAt: number;
};

export type LicenseStorage = {
  get: (key: string) => Promise<StoredProLicense | null>;
  set: (key: string, value: StoredProLicense) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type LicenseServiceDependencies = VerifyLicenseTokenDependencies & {
  storage: LicenseStorage;
  publicKeyPem: string;
};

export type LicenseCheckResult = LicenseTokenVerification | {
  valid: false;
  code: "NO_LICENSE";
};

export function createLicenseService({
  storage,
  publicKeyPem,
  subtle,
  now = Date.now,
}: LicenseServiceDependencies) {
  function verify(token: string): Promise<LicenseTokenVerification> {
    return verifyProLicenseToken(token, publicKeyPem, { subtle, now });
  }

  return {
    async activate(token: string) {
      const verification = await verify(token);
      if (!verification.valid) {
        return verification;
      }

      await storage.set(PRO_LICENSE_STORAGE_KEY, {
        version: 1,
        token: token.trim(),
        claims: verification.claims,
        activatedAt: now(),
      });
      return verification;
    },

    async check(): Promise<LicenseCheckResult> {
      const stored = await storage.get(PRO_LICENSE_STORAGE_KEY);
      if (!stored) {
        return { valid: false, code: "NO_LICENSE" };
      }

      const verification = await verify(stored.token);
      if (!verification.valid) {
        await storage.remove(PRO_LICENSE_STORAGE_KEY);
      }
      return verification;
    },

    async revoke() {
      await storage.remove(PRO_LICENSE_STORAGE_KEY);
    },
  };
}
