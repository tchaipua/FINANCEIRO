import assert from "node:assert/strict";
import { hasSourceOwnedBranchStockChanges } from "../src/common/company-branches";

const current = {
  inventoryControlType: "COLOR_SIZE",
  quantityPrecision: "INTEGER_ONLY",
  stockControlMode: "BY_PRODUCT",
  stockIntegerQuantityMode: "BY_PRODUCT",
  stockLotControlMode: "NO",
  stockExpirationControlMode: "NO",
  stockGridControlMode: "BY_PRODUCT",
  stockNegativeControlMode: "NO",
  stockClassificationMode: "GROUP_ONLY",
};

assert.equal(
  hasSourceOwnedBranchStockChanges(
    {
      inventoryControlType: "COLOR_SIZE",
      quantityPrecision: "INTEGER_ONLY",
      stockClassificationMode: "GROUP_AND_SUBGROUP",
    },
    current,
  ),
  true,
);

assert.equal(
  hasSourceOwnedBranchStockChanges(
    { inventoryControlType: "LOT" },
    current,
  ),
  true,
);

assert.equal(
  hasSourceOwnedBranchStockChanges(
    { stockNegativeControlMode: "YES" },
    current,
  ),
  true,
);

process.stdout.write(
  "Distinção entre parâmetros da origem e exclusivos do Financeiro validada.\n",
);
