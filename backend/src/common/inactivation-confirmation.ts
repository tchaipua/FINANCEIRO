import { BadRequestException } from "@nestjs/common";

type InactivationConfirmationPayload = {
  password?: unknown;
  reason?: unknown;
};

/**
 * All destructive status changes must arrive with the confirmation data shown
 * by the standard inactivation popup. Credential verification remains owned by
 * the source system; the Financeiro API rejects incomplete confirmations.
 */
export function assertInactivationConfirmation(
  payload: InactivationConfirmationPayload,
) {
  if (!String(payload?.password ?? "").trim()) {
    throw new BadRequestException("Informe a senha de inativação.");
  }

  if (!String(payload?.reason ?? "").trim()) {
    throw new BadRequestException("Informe o motivo da inativação.");
  }
}
