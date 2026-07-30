const FEATURE_VARIABLE = "FINANCEIRO_SICOOB_POWERSHELL_ENABLED";

export function isSicoobPowerShellEnabled() {
  const configured = String(process.env[FEATURE_VARIABLE] || "")
    .trim()
    .toLowerCase();
  if (!configured || configured === "false") return false;
  if (configured === "true") return true;
  throw new Error(`${FEATURE_VARIABLE} deve ser exatamente true ou false.`);
}

export function validateSicoobPowerShellRuntime() {
  if (!isSicoobPowerShellEnabled()) return;
  if (process.platform !== "win32") {
    throw new Error(
      `${FEATURE_VARIABLE}=true é incompatível com a imagem Linux atual. ` +
        "A integração Sicoob PowerShell permanece bloqueada até ser portada " +
        "para um cliente Node.js com mTLS.",
    );
  }
}

export function requireSicoobPowerShellExecutable() {
  if (!isSicoobPowerShellEnabled()) {
    throw new Error(
      "A integração Sicoob baseada em PowerShell está desabilitada neste ambiente. " +
        `Não habilite ${FEATURE_VARIABLE} na imagem Linux de produção.`,
    );
  }
  if (process.platform !== "win32") {
    throw new Error(
      "A integração Sicoob PowerShell não é suportada neste runtime Linux.",
    );
  }
  return "powershell.exe";
}
