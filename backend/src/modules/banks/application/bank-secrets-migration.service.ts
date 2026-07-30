import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  encryptSecret,
  isVersionedEncryptedSecret,
} from "../../../common/secret-crypto.utils";

const SECRET_FIELDS = [
  "billingApiClientSecret",
  "billingCertificateBase64",
  "billingCertificatePassword",
] as const;

@Injectable()
export class BankSecretsMigrationService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const banks = await this.prisma.bankAccount.findMany({
      where: {
        OR: [
          {
            billingApiClientSecret: {
              not: { startsWith: "v1:" },
            },
          },
          {
            billingCertificateBase64: {
              not: { startsWith: "v1:" },
            },
          },
          {
            billingCertificatePassword: {
              not: { startsWith: "v1:" },
            },
          },
        ],
      },
      select: {
        id: true,
        billingApiClientSecret: true,
        billingCertificateBase64: true,
        billingCertificatePassword: true,
      },
    });

    for (let index = 0; index < banks.length; index += 20) {
      const batch = banks.slice(index, index + 20);
      await Promise.all(
        batch.map(async (bank) => {
          const protectedValues: Partial<
            Record<(typeof SECRET_FIELDS)[number], string>
          > = {};

          for (const field of SECRET_FIELDS) {
            const storedValue = String(bank[field] || "").trim();
            if (storedValue && !isVersionedEncryptedSecret(storedValue)) {
              protectedValues[field] = encryptSecret(storedValue);
            }
          }

          if (Object.keys(protectedValues).length > 0) {
            await this.prisma.bankAccount.update({
              where: { id: bank.id },
              data: protectedValues,
            });
          }
        }),
      );
    }
  }
}
