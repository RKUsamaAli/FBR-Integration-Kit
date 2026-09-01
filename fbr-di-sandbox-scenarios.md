# FBR Digital Invoicing — Sandbox Case Scenarios (SN001–SN028)

**Applies to Digital Invoicing only.** FBR POS has no scenario concept — see
`fbr-pos-digital-invoice-developer-guide.md`.

**Payloads:** `fbr-di-sandbox-scenarios.json` — 28 complete, known-good request bodies.
**Runner:** `fbr-test-harness.html` — load a scenario, apply your seller identity, post or validate it.

---

## 1. What a scenario is, and why it gates your go-live

In the DI sandbox, `scenarioId` in the header tells FBR **which business situation you are claiming to
model** (`"SN001"` … `"SN028"`). FBR then validates the payload against that situation's rules — the
`saleType`, the `rate`, the SRO references and the buyer registration type must all be internally
consistent with the scenario, not just individually well-formed.

**FBR assigns each seller a subset of these scenarios**, derived from the business activity/sector on
their IRIS profile. Find the assigned list in **IRIS → Digital Invoicing → Sandbox**. You must post
every assigned scenario successfully before the Production token is issued. Posting the other
scenarios is neither required nor harmful — but a scenario outside your assigned list is rejected with
`[0203] Provided scenario does not exists`.

**`scenarioId` is a sandbox-only field.** Sending it to a production endpoint is a rejection. Strip it
by environment, not by hand.

---

## 2. The 28 scenarios

Each row shows the discriminating fields — the ones that must match, and the ones that break the
payload if you copy them from another scenario.

| ID | Situation | `saleType` | `rate` | Buyer | SRO schedule / item serial |
|---|---|---|---|---|---|
| `SN001` | Sale of Standard Rate Goods to Registered Buyers | `Goods at standard rate (default)` | `18%` | Registered | — |
| `SN002` | Sale of Standard Rate Goods to Unregistered Buyers | `Goods at standard rate (default)` | `18%` | Unregistered | — |
| `SN003` | Sale of Steel (Melted and Re-Rolled) (Billets, Ingots and Long Bars) | `Steel melting and re-rolling` | `18%` | Unregistered | — |
| `SN004` | Sale of Steel Scrap by Ship Breakers | `Ship breaking` | `18%` | Unregistered | — |
| `SN005` | Sales of Reduced Rate Goods (Eighth Schedule) | `Goods at Reduced Rate` | `1%` | Unregistered | EIGHTH SCHEDULE Table 1 / 82 |
| `SN006` | Sale of Exempt Goods (Sixth Schedule) | `Exempt goods` | `Exempt` | Unregistered | 6th Schd Table I / 100 |
| `SN007` | Sale of Zero-Rated Goods (Fifth Schedule) | `Goods at zero-rate` | `0%` | Unregistered | 327(I)/2008 / 1 |
| `SN008` | Sale of 3rd Schedule Goods | `3rd Schedule Goods` | `18%` | Unregistered | — |
| `SN009` | Purchase from Registered Cotton Ginners | `Cotton ginners` | `18%` | Registered | — |
| `SN010` | Sale of Telecom Services by Mobile Operators | `Telecommunication services` | `17%` | Unregistered | — |
| `SN011` | Sale of Steel through Toll Manufacturing (Billets, Ingots and Long Bars) | `Toll Manufacturing` | `18%` | Unregistered | — |
| `SN012` | Sale of Petroleum Products | `Petroleum Products` | `1.43%` | Unregistered | 1450(I)/2021 / 4 |
| `SN013` | Sale of Electricity to Retailers | `Electricity Supply to Retailers` | `5%` | Unregistered | 1450(I)/2021 / 4 |
| `SN014` | Sale of Gas to CNG Stations | `Gas to CNG stations` | `18%` | Unregistered | — |
| `SN015` | Sale of Mobile Phones | `Mobile Phones` | `18%` | Unregistered | NINTH SCHEDULE / 1(A) |
| `SN016` | Processing / Conversion of Goods | `Processing/Conversion of Goods` | `5%` | Unregistered | — |
| `SN017` | Sale of Goods Where FED Is Charged in ST Mode | `Goods (FED in ST Mode)` | `8%` | Unregistered | — |
| `SN018` | Sale of Services Where FED Is Charged in ST Mode | `Services (FED in ST Mode)` | `8%` | Unregistered | — |
| `SN019` | Sale of Services (as per ICT Ordinance) | `Services` | `5%` | Unregistered | ICTO TABLE I / 1(ii)(ii)(a) |
| `SN020` | Sale of Electric Vehicles | `Electric Vehicle` | `1%` | Unregistered | 6th Schd Table III / 20 |
| `SN021` | Sale of Cement / Concrete Block | `Cement /Concrete Block` | `Rs.3` | Unregistered | — |
| `SN022` | Sale of Potassium Chlorate | `Potassium Chlorate` | `18% along with rupees 60 per kilogram` | Unregistered | EIGHTH SCHEDULE Table 1 / 56 |
| `SN023` | Sale of CNG | `CNG Sales` | `Rs.200` | Unregistered | 581(1)/2024 / Region-I |
| `SN024` | Sale of Goods Listed in SRO 297(I)/2023 | `Goods as per SRO.297(\|)/2023` | `25%` | Unregistered | 297(I)/2023-Table-I / 12 |
| `SN025` | Drugs Sold at Fixed ST Rate (Serial 81, Eighth Schedule Table 1) | `Non-Adjustable Supplies` | `0%` | Unregistered | EIGHTH SCHEDULE Table 1 / 81 |
| `SN026` | Sale of Goods at Standard Rate to End Consumers by Retailers | `Goods at standard rate (default)` | `18%` | Unregistered | — |
| `SN027` | Sale of 3rd Schedule Goods to End Consumers by Retailers | `3rd Schedule Goods` | `18%` | Unregistered | — |
| `SN028` | Sale of Goods at Reduced Rate to End Consumers by Retailers | `Goods at Reduced Rate` | `1%` | Unregistered | EIGHTH SCHEDULE Table 1 / 70 |

**Reading the table:** `saleType` and `rate` are the two fields that must agree with the scenario.
Take them verbatim from the JSON file — including odd spellings, spacing, and the pipe character in
SN024's `Goods as per SRO.297(|)/2023`. They are FBR registry strings, not free text.

---

## 3. Scenario groups, and what each teaches your code

| Group | Scenarios | What it exercises in your implementation |
|---|---|---|
| **Standard rate** | SN001, SN002, SN026 | The baseline path, and the registered-vs-unregistered split that drives further tax / extra tax. |
| **Sector-specific sale types** | SN003, SN004, SN009, SN011, SN014, SN016 | That `saleType` is data on your product master, not a constant. Steel, ship breaking, cotton ginners, toll manufacturing, CNG stations, processing/conversion. |
| **Reduced rate & schedules** | SN005, SN028 | SRO plumbing: `sroScheduleNo` + `sroItemSerialNo`, and the `extraTax`/`furtherTax` `""` rule (a numeric `0` is rejected with `[0091]`). |
| **Exempt / zero-rated** | SN006, SN007, SN025 | A `rate` that is not a percentage (`"Exempt"`, `"0%"`) with a non-zero `valueSalesExcludingST`. |
| **3rd Schedule (retail price)** | SN008, SN027 | Tax computed on `fixedNotifiedValueOrRetailPrice` while `valueSalesExcludingST` must still be > 0 (`[0300]` otherwise). |
| **Services** | SN010, SN018, SN019 | Service sale types and the ICT Ordinance SRO wording. |
| **FED in ST mode** | SN017, SN018 | `fedPayable` inside the sales-tax base — the calculation trap in §7.1 of the DI guide. |
| **Fixed-amount rates** | SN021, SN023 | `rate` values like `"Rs.3"` and `"Rs.200"` — proof that `rate` is a lookup **string**, not a number your code multiplies by. |
| **Compound rates** | SN022 | `"18% along with rupees 60 per kilogram"` — percentage plus per-unit in one rate. |
| **Petroleum** | SN012 | The 2026 `petroleumLevyOn` field. Omitted → `[0129]`. |
| **Notified goods** | SN013, SN015, SN020, SN024 | Electricity to retailers, mobile phones (Ninth Schedule), EVs, SRO 297(I)/2023. |
| **Retail to end consumers** | SN026, SN027, SN028 | The retailer variants of standard / 3rd Schedule / reduced rate. |

If your seller's assigned list is short, still run one scenario from each group your catalogue can
produce. The groups map one-to-one onto the branches in your payload builder — that is where the bugs are.

---

## 4. Running them

**Order matters.** Do it in this sequence:

1. **Validate all** (`validateinvoicedata_sb`) — writes nothing, so iterate freely. Fix every failure
   here first.
2. **Post the assigned ones** (`postinvoicedata_sb`) — each must return `statusCode: "00"`, `"Valid"`,
   and an `invoiceNumber`.
3. **Repeat from your own application**, not just the harness. The harness proves FBR accepts the
   payload; only your app proves your *mapping* produces that payload from a real sale.
4. **Check IRIS → Sandbox** shows every assigned scenario completed, then generate the production token.

The seller identity in the JSON file is sample data. Replace `sellerNTNCNIC`, `sellerBusinessName`,
`sellerProvince` and `sellerAddress` with the values registered against **your** token — FBR rejects a
payload whose seller does not match the token's owner. The harness has fields that apply your seller to
every scenario in one go.

---

## 5. Buyer identities in the sandbox

FBR cross-checks `buyerRegistrationType` against the buyer NTN/CNIC's real profile (`[0053]`).

| Buyer value | Send as |
|---|---|
| `2046004` | `"Registered"` — the known registered sandbox NTN |
| A dummy 13-digit CNIC (`10000000000xx`) | `"Unregistered"` |
| A real buyer NTN | Whatever `dist/v1/Get_Reg_Type` reports for it |

Do not invent an NTN and mark it Registered — that is the fastest way to a rejection that looks like
a payload bug but is not.

---

## 6. When a scenario fails

| Symptom | Where the fix lives |
|---|---|
| `[0203] Provided scenario does not exists` | **IRIS, not code.** The scenario is not on this seller's assigned list. |
| `[0204] Sale type not match with provided scenario No.` | Your `saleType` string differs from FBR's registry — copy it from the JSON file character for character. |
| `[0053] Registration type does not match` | `buyerRegistrationType` vs the buyer's real profile. See §5. |
| `[0091]` on a reduced-rate scenario | You sent numeric `0` in `extraTax`/`furtherTax`. Send `""`. |
| `[0300]` numeric values invalid | A required numeric is `null`/omitted, or `valueSalesExcludingST` is `0`. |
| `[0129]` petroleum levy empty | SN012 needs `petroleumLevyOn`. |
| `[0046] Provide rate.` | `rate` missing, or not the lookup string for that sale type. |
| `[0052]` HS code | `hsCode` not in FBR's list or wrongly formatted. |
| HTTP 401 | Wrong token, or a production token on a `_sb` URL. |

Full error table and response-handling rules: §8 and §10 of `fbr-digital-invoice-developer-guide.md`.
