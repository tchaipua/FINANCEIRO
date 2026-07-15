import "dotenv/config";
import { request } from "https";
import tls from "tls";
import { readFile } from "fs/promises";
import { loadNfceCertificateMaterial } from "../src/modules/fiscal-documents/application/nfce/nfce-certificate.utils";

function required(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}.`);
  return value;
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tag(xml: string, name: string) {
  return xml.match(new RegExp(`<${name}>(.*?)</${name}>`, "s"))?.[1]?.trim() || null;
}

async function main() {
  const pfxBase64 = (await readFile(required("NFCE_PFX_PATH"))).toString("base64");
  const certificate = loadNfceCertificateMaterial(pfxBase64, required("NFCE_PFX_PASSWORD"));
  const cnpj = required("NFCE_ISSUER_CNPJ").replace(/\D/g, "");
  if (certificate.holderCnpj !== cnpj) throw new Error("CNPJ consultado difere do titular do certificado.");
  const body = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4"><ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00"><infCons><xServ>CONS-CAD</xServ><UF>SP</UF><CNPJ>${cnpj}</CNPJ></infCons></ConsCad></nfeDadosMsg></soap12:Body></soap12:Envelope>`;
  const response = await new Promise<string>((resolve, reject) => {
    const getCa = (tls as typeof tls & {
      getCACertificates?: (type: "system") => string[];
    }).getCACertificates;
    const req = request({
      hostname: "homologacao.nfe.fazenda.sp.gov.br",
      path: "/ws/cadconsultacadastro4.asmx",
      method: "POST",
      pfx: certificate.pfxBuffer,
      passphrase: certificate.passphrase,
      ca: getCa ? [...tls.rootCertificates, ...getCa("system")] : [...tls.rootCertificates],
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.end(body);
  });
  const xml = decodeXml(response);
  process.stdout.write(`${JSON.stringify({
    cStat: tag(xml, "cStat"),
    motivo: tag(xml, "xMotivo"),
    cnpj: tag(xml, "CNPJ"),
    ie: tag(xml, "IE"),
    razaoSocial: tag(xml, "xNome"),
    nomeFantasia: tag(xml, "xFant"),
    regime: tag(xml, "xRegApur"),
    indicadorNfe: tag(xml, "indCredNFe"),
    cnae: tag(xml, "CNAE"),
    logradouro: tag(xml, "xLgr"),
    numero: tag(xml, "nro"),
    complemento: tag(xml, "xCpl"),
    bairro: tag(xml, "xBairro"),
    municipio: tag(xml, "xMun"),
    codigoMunicipio: tag(xml, "cMun"),
    uf: tag(xml, "UF"),
    cep: tag(xml, "CEP"),
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
