type SmtpSettingsInput = {
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  smtpAuthenticate?: boolean | null;
  smtpUsername?: string | null;
  smtpEmail?: string | null;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
  smtpPasswordEncrypted?: string | null;
  smtpTimeout?: number | null;
  smtpTimeoutSeconds?: number | null;
};

export type EffectiveSmtpSettings = {
  source: "PROFILE" | "SOURCE_COMPANY_BRANCH";
  host: string;
  port: number;
  secure: boolean;
  authenticate: boolean;
  username: string;
  fromEmail: string;
  fromName: string;
  passwordEncrypted: string | null;
  timeoutSeconds: number;
};

function mapProfile(input: SmtpSettingsInput): EffectiveSmtpSettings {
  return {
    source: "PROFILE",
    host: String(input.smtpHost || "").trim().toLowerCase(),
    port: Number(input.smtpPort || 0),
    secure: Boolean(input.smtpSecure),
    authenticate: input.smtpAuthenticate !== false,
    username: String(input.smtpUsername || input.smtpFromEmail || "").trim(),
    fromEmail: String(input.smtpFromEmail || "").trim().toLowerCase(),
    fromName: String(input.smtpFromName || "").trim(),
    passwordEncrypted: input.smtpPasswordEncrypted || null,
    timeoutSeconds: Number(input.smtpTimeoutSeconds || 60),
  };
}

function mapSource(input: SmtpSettingsInput): EffectiveSmtpSettings {
  const email = String(input.smtpEmail || "").trim().toLowerCase();
  return {
    source: "SOURCE_COMPANY_BRANCH",
    host: String(input.smtpHost || "").trim().toLowerCase(),
    port: Number(input.smtpPort || 0),
    secure: Boolean(input.smtpSecure),
    authenticate: input.smtpAuthenticate !== false,
    username: email,
    fromEmail: email,
    fromName: "",
    passwordEncrypted: input.smtpPasswordEncrypted || null,
    timeoutSeconds: Number(input.smtpTimeout || 60),
  };
}

function isComplete(settings: EffectiveSmtpSettings) {
  return Boolean(
    settings.host &&
      Number.isInteger(settings.port) &&
      settings.port >= 1 &&
      settings.port <= 65535 &&
      settings.fromEmail &&
      (!settings.authenticate ||
        (settings.username && settings.passwordEncrypted)),
  );
}

export function resolveEffectiveSmtpSettings(
  profile: SmtpSettingsInput,
  sourceConfiguration?: SmtpSettingsInput | null,
) {
  const profileSettings = mapProfile(profile);
  if (isComplete(profileSettings)) return profileSettings;

  const sourceSettings = mapSource(sourceConfiguration || {});
  return isComplete(sourceSettings) ? sourceSettings : profileSettings;
}
