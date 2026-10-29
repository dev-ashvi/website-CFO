/**
 * Anonymized demonstration dataset. Synthetic seller, not a client export.
 */

export function buildSampleDataset() {
  const csvText = [
    `"Date","Transaction Status","Account Type","Transaction type","Order ID","Product Details","Total product charges","Total promotional rebates","Amazon fees","Other","Total (INR)"`,
    `"15/6/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Order Payment","111-1000001-0000001","Demo Spiced Nuts 200g...","400.00","0","-40.00","17.60","377.60"`,
    `"16/6/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Order Payment","111-1000002-0000002","Demo Rose Syrup 500ml...","370.48","0","-30.68","16.29","356.09"`,
    `"17/6/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Order Payment","111-1000003-0000003","Demo Lemon Ginger 650ml...","237.14","-20.00","-23.60","10.42","203.96"`,
    `"18/6/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Order Payment","111-1000004-0000004","Demo Spiced Nuts 200g...","1200.00","0","-96.00","52.80","1156.80"`,
    `"19/6/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Refund","111-1000002-0000002","Demo Rose Syrup 500ml...","-370.48","0","30.68","-16.29","-356.09"`,
    `"20/6/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Service Fees","---","Cost of Advertising","0","0","-500.00","0","-500.00"`,
    `"21/6/2026","Released","Cash On Delivery Transactions and Non-Transactional Fees","Service Fees","---","Inbound Transportation Fee","0","0","0","-150.00","-150.00"`,
    `"22/6/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Order Payment","111-1000005-0000005","Demo Chai Masala 100g...","95.24","0","-23.60","4.18","75.82"`,
    `"23/6/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Service Fees","---","Subscription:","0","0","0","0","0"`,
    `"24/6/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Debt Adjustment","ADJ-1","Cross-Account Debt Adjustment","0","0","0","-50.00","-50.00"`,
    `"24/6/2026","Released","Cash On Delivery Transactions and Non-Transactional Fees","Debt Adjustment","ADJ-1","Cross-Account Debt Adjustment","0","0","0","50.00","50.00"`,
    `"25/7/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Order Payment","111-1000006-0000006","Demo Rose Syrup 500ml...","740.96","0","-61.36","32.58","712.18"`,
    `"26/7/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Order Payment","111-1000007-0000007","Demo Banana Chips 200g...","284.76","0","-23.60","12.53","273.69"`,
    `"27/7/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Cancellation","111-1000008-0000008","Order Cancellation Charge","0","0","0","0","0"`,
    `"28/8/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Order Payment","111-1000009-0000009","Demo Unknown Bundle...","500.00","0","-40.00","22.00","482.00"`,
    `"29/8/2026","Released","Electronic Transactions (Credit Card/Net Banking/GC)","Service Fees","---","Mystery Platform Charge","0","0","-15.00","0","-15.00"`,
  ].join("\n");

  const summary = {
    currency: "INR",
    periodRaw: "Jun 1, 2026 – Aug 31, 2026",
    income: 3457.1,
    expenses: -909.56,
    netGstCollected: 152.11,
    transfers: -2200.0,
    transfersToBank: -2200.0,
    sellerFulfilledProductSales: 3828.58,
    sellerFulfilledProductSaleRefunds: -370.48,
    sellerFulfilledSellingFees: 0,
    otherTransactionFees: -339.24,
    costOfAdvertising: -500.0,
    inboundServicesFees: -150.0,
    promotionalRebates: -20.0,
    gstCollected: 168.4,
    fields: [],
  };

  return {
    id: "sample_anonymized_v1",
    label: "Anonymized sample seller",
    csvText,
    summary,
    confidential: false,
  };
}
