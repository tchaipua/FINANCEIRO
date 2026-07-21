import assert from "node:assert/strict";
import {
  calculateCnpjCheckDigits,
  calculateFiscalAccessKeyDigit,
  isValidBrazilTaxId,
  isValidCnpj,
  normalizeTaxId,
} from "../src/common/brazil-tax-id.utils";

assert.equal(normalizeTaxId("12.ABC.345/01DE-35"), "12ABC34501DE35");
assert.equal(calculateCnpjCheckDigits("12ABC34501DE"), "35");
assert.equal(isValidCnpj("12.ABC.345/01DE-35"), true);
assert.equal(isValidCnpj("12.ABC.345/01DE-36"), false);
assert.equal(isValidCnpj("69.342.038/0001-49"), true);
assert.equal(isValidBrazilTaxId("529.982.247-25"), true);

const accessKeyBase = "35260712ABC34501DE3555001000000001100000001";
assert.equal(accessKeyBase.length, 43);
assert.match(calculateFiscalAccessKeyDigit(accessKeyBase), /^\d$/);

console.log("brazil-tax-id.test.ts: OK");
