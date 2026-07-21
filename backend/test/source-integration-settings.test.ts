import assert from "node:assert/strict";
import { resolveEffectiveSmtpSettings } from "../src/common/source-integration-settings";

const source = {
  smtpHost: "SMTP.EMPRESA.COM",
  smtpPort: 465,
  smtpSecure: true,
  smtpAuthenticate: true,
  smtpEmail: "FINANCEIRO@EMPRESA.COM",
  smtpPasswordEncrypted: "encrypted-source-password",
  smtpTimeout: 45,
};

const sourceFallback = resolveEffectiveSmtpSettings(
  { smtpHost: "", smtpPort: 0 },
  source,
);

assert.equal(sourceFallback.source, "SOURCE_COMPANY_BRANCH");
assert.equal(sourceFallback.host, "smtp.empresa.com");
assert.equal(sourceFallback.fromEmail, "financeiro@empresa.com");
assert.equal(sourceFallback.timeoutSeconds, 45);

const completeProfile = resolveEffectiveSmtpSettings(
  {
    smtpHost: "SMTP.PERFIL.COM",
    smtpPort: 587,
    smtpSecure: false,
    smtpAuthenticate: true,
    smtpUsername: "perfil-user",
    smtpFromEmail: "NFSE@EMPRESA.COM",
    smtpFromName: "NOTAS FISCAIS",
    smtpPasswordEncrypted: "encrypted-profile-password",
    smtpTimeoutSeconds: 30,
  },
  source,
);

assert.equal(completeProfile.source, "PROFILE");
assert.equal(completeProfile.host, "smtp.perfil.com");
assert.equal(completeProfile.fromEmail, "nfse@empresa.com");

const incompleteSource = resolveEffectiveSmtpSettings(
  { smtpHost: "SMTP.INCOMPLETO.COM", smtpPort: 587 },
  { smtpHost: "SMTP.ORIGEM.COM", smtpPort: 465 },
);

assert.equal(incompleteSource.source, "PROFILE");
assert.equal(incompleteSource.host, "smtp.incompleto.com");

console.log("source-integration-settings.test.ts: OK");
