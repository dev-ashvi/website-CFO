/** Canonical assumption value kinds */
export const ASSUMPTION_TYPE = {
  PERCENTAGE: "percentage",
  CURRENCY: "currency",
  COUNT: "count",
  FX_RATE: "fx_rate",
  TEXT: "text",
};

export const ASSUMPTION_UNIT = {
  PERCENT: "percent",
  INR: "inr",
  COUNT: "count",
  INR_PER_USD: "inr_per_usd",
  TEXT: "text",
};

export const ASSUMPTION_STATUS = {
  CONFIRMED: "confirmed",
  DRAFT: "draft",
};

export const ASSUMPTION_SOURCE = {
  CHAT: "chat",
  MANUAL: "manual",
};

export const LAST_UPDATED_BY = {
  USER: "user",
  SYSTEM: "system",
};

export const PROPOSAL_KIND = {
  ASSUMPTION_UPDATE: "assumption_update",
};

export const PROPOSAL_MODE = {
  APPLY: "apply",
  SCENARIO: "scenario",
};
