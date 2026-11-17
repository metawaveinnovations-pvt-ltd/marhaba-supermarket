import type {
  AttractionStatus,
  PlayAttractionRecord,
  PlayPackageRecord,
  PlaySessionRecord,
  PlayTicketRecord,
} from './types';

export function computeTicketPrice(params: {
  pkg: PlayPackageRecord;
  participantCountMultiplier?: number;
  discountPercent: number;
}) {
  const mult = Math.max(1, Math.floor(params.participantCountMultiplier || 1));
  const baseAmountPkr = params.pkg.pricePkr * mult;
  const clampedDiscount = Math.max(0, Math.min(100, params.discountPercent || 0));
  const discountAmountPkr = Math.round((baseAmountPkr * clampedDiscount) / 100);
  const finalAmountPkr = Math.max(0, baseAmountPkr - discountAmountPkr);
  return {
    baseAmountPkr,
    discountAmountPkr,
    finalAmountPkr,
  };
}

export function checkSessionCapacity(
  session: PlaySessionRecord | undefined,
  requestedGuests: number
): { allowed: boolean; remaining: number; reason?: string } {
  if (!session) {
    return { allowed: false, remaining: 0, reason: 'Selected session not found.' };
  }
  if (session.status === 'Cancelled' || session.status === 'Completed') {
    return {
      allowed: false,
      remaining: 0,
      reason: `Session "${session.windowLabel}" is ${session.status.toLowerCase()}.`,
    };
  }
  const remaining = Math.max(0, session.maxCapacity - session.allocatedCount);
  if (requestedGuests > remaining) {
    return {
      allowed: false,
      remaining,
      reason: `Session capacity reached (${remaining} slot(s) remaining out of ${session.maxCapacity}).`,
    };
  }
  return { allowed: true, remaining: remaining - requestedGuests };
}

export function isAttractionOperable(status: AttractionStatus): boolean {
  return status === 'Ready / Authorized to Open' || status === 'Operating';
}

export function isAttractionSafetyLocked(status: AttractionStatus): boolean {
  return status === 'Out of Service' || status === 'Under Maintenance' || status === 'Incident Hold';
}

export function validateTicketAdmission(params: {
  ticket: PlayTicketRecord | undefined;
  session: PlaySessionRecord | undefined;
  attractions: PlayAttractionRecord[];
  pkg: PlayPackageRecord | undefined;
  todayDate: string;
}): {
  result:
    | 'Valid'
    | 'Already Used'
    | 'Not Yet Valid'
    | 'Expired'
    | 'Cancelled'
    | 'Invalid'
    | 'Requires Supervisor';
  canAdmit: boolean;
  reason: string;
} {
  const { ticket, session, attractions, pkg, todayDate } = params;
  if (!ticket) {
    return { result: 'Invalid', canAdmit: false, reason: 'Ticket ID / QR code not recognized.' };
  }
  if (ticket.paymentStatus !== 'Confirmed') {
    return {
      result: 'Requires Supervisor',
      canAdmit: false,
      reason: `Payment status is ${ticket.paymentStatus}. Cannot admit without confirmed payment.`,
    };
  }
  if (ticket.status === 'Cancelled' || ticket.status === 'Refunded') {
    return {
      result: 'Cancelled',
      canAdmit: false,
      reason: `Ticket is ${ticket.status.toLowerCase()} and cannot be admitted.`,
    };
  }
  if (ticket.status === 'Expired' || ticket.validDate < todayDate) {
    return {
      result: 'Expired',
      canAdmit: false,
      reason: `Ticket expired on ${ticket.validDate}.`,
    };
  }
  if (ticket.validDate > todayDate) {
    return {
      result: 'Not Yet Valid',
      canAdmit: false,
      reason: `Ticket is scheduled for ${ticket.validDate} (not yet valid today ${todayDate}).`,
    };
  }
  if (session && session.status === 'Cancelled') {
    return {
      result: 'Requires Supervisor',
      canAdmit: false,
      reason: 'Scheduled session was cancelled. Refer guest to Admissions Supervisor.',
    };
  }
  if (ticket.entriesUsed >= ticket.maxEntries && !ticket.reentryAllowed) {
    return {
      result: 'Already Used',
      canAdmit: false,
      reason: `Single-entry ticket already checked in at ${ticket.lastScannedAt || 'earlier today'}.`,
    };
  }

  // Check if all included attractions in the package are blocked by safety holds
  if (pkg && pkg.permittedAttractionIds.length > 0) {
    const included = attractions.filter((a) => pkg.permittedAttractionIds.includes(a.id));
    const availableAny = included.some((a) => !isAttractionSafetyLocked(a.status) && a.status !== 'Closed');
    if (included.length > 0 && !availableAny) {
      return {
        result: 'Requires Supervisor',
        canAdmit: false,
        reason: 'All attractions included in this package are currently unavailable or on safety hold.',
      };
    }
  }

  return {
    result: 'Valid',
    canAdmit: true,
    reason: `Valid for ${ticket.packageName} · ${ticket.sessionLabel}.`,
  };
}

export function getEligibleAttractionsForChild(
  attractions: PlayAttractionRecord[],
  childAgeYears: number
): {
  eligible: PlayAttractionRecord[];
  unavailableOrRestricted: { attraction: PlayAttractionRecord; reason: string }[];
} {
  const eligible: PlayAttractionRecord[] = [];
  const unavailableOrRestricted: { attraction: PlayAttractionRecord; reason: string }[] = [];

  for (const attr of attractions) {
    if (isAttractionSafetyLocked(attr.status) || attr.status === 'Closed' || attr.status === 'Paused') {
      unavailableOrRestricted.push({ attraction: attr, reason: `Currently ${attr.status}` });
      continue;
    }
    if (childAgeYears < attr.minAgeYears || childAgeYears > attr.maxAgeYears) {
      unavailableOrRestricted.push({
        attraction: attr,
        reason: `Age range ${attr.minAgeYears}–${attr.maxAgeYears} yrs`,
      });
      continue;
    }
    eligible.push(attr);
  }
  return { eligible, unavailableOrRestricted };
}

export function computePlayShiftClosing(params: {
  openingFloatPkr: number;
  cashSalesPkr: number;
  refundsPkr: number;
  declaredCashPkr: number;
}) {
  const expectedCashPkr = Math.max(0, params.openingFloatPkr + params.cashSalesPkr - params.refundsPkr);
  const variancePkr = params.declaredCashPkr - expectedCashPkr;
  return {
    expectedCashPkr,
    variancePkr,
    hasVariance: variancePkr !== 0,
  };
}
