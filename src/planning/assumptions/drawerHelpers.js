import { ASSUMPTION_TYPE } from "./types.js";

export function valueFieldHelp(type, key) {
  switch (type) {
    case ASSUMPTION_TYPE.PERCENTAGE:
      return "Use a percentage, e.g. 8% or 12.5%";
    case ASSUMPTION_TYPE.COUNT:
      return key === "hiring" ? "Enter how many roles (e.g. 2)" : "Enter a whole number";
    case ASSUMPTION_TYPE.FX_RATE:
      return "INR per 1 USD, e.g. 85 or 83.2";
    case ASSUMPTION_TYPE.CURRENCY:
      return "Amount in INR";
    default:
      return "Free text — notes or labels";
  }
}

export function valuePlaceholder(type, key) {
  switch (type) {
    case ASSUMPTION_TYPE.PERCENTAGE:
      return "12%";
    case ASSUMPTION_TYPE.COUNT:
      return key === "hiring" ? "2" : "0";
    case ASSUMPTION_TYPE.FX_RATE:
      return "85";
    case ASSUMPTION_TYPE.CURRENCY:
      return "1000000";
    default:
      return "";
  }
}
