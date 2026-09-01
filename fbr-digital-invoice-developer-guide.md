# FBR Digital Invoicing (DI) — Developer Integration Guide

**Audience:** a developer integrating FBR Digital Invoicing into an application from scratch.
**Scope:** registration → sandbox token → passing all assigned scenarios → production token → live posting → printing.
**Companion files:** `fbr-di-sandbox-scenarios.md` (case scenarios), `fbr-di-sandbox-scenarios.json` (28 ready payloads), `fbr-test-harness.html` (browser test runner), `fbr-proxy.js` (CORS relay).
**Reference spec:** `../FBR_Digital_Invoicing_API_Technical_Specification_User_Manual_v1.12.md`

---

## 1. What DI is, and when it applies

Digital Invoicing is FBR's **real-time sales-tax invoice register**. Every sales-tax invoice a registered
person issues (B2B and B2C) is POSTed to FBR **as it is issued**. FBR validates it, and if it passes,
returns an **official FBR invoice number** (e.g. `7000007DI1747119701593`). That number — plus a QR code
of it — must be printed on the customer's invoice. An invoice without an FBR number is not a legal
sales-tax invoice.

Who it applies to: sales-tax registered persons notified by FBR (importers, manufacturers, wholesalers,
distributors, large retailers, and by extension most corporate sellers). Read `fbr-pos-digital-invoice-developer-guide.md`
for the separate POS channel and §2 below for which one you need.

**Two hard rules that shape your design:**
1. FBR is the *source of truth* for the invoice number. Your app's own invoice number is internal.
2. Once FBR accepts an invoice, it cannot be edited or deleted — only reversed with a **Debit Note**
   that references the original FBR number. So your invoice must be **locked** in your database the
   moment FBR accepts it.

---

## 2. DI vs POS — pick the right one

| | **Digital Invoicing (DI)** | **POS Digital Invoicing** |
|---|---|---|
| Purpose | Legal sales-tax invoice register | Retail till/receipt reporting (SRO 1006) |
| Typical user | Manufacturer, importer, distributor, wholesaler, corporate seller | Tier-1 retailer, restaurant, outlet counter |
| Registers | The *invoice* | The *terminal* (each till has a BPOS ID) |
| Endpoint | `gw.fbr.gov.pk/di_data/v1/di/...` | `gw.fbr.gov.pk/pdi/v1/api/DigitalInvoicing/...` |
| Field style | Descriptive strings (`"18%"`, `"Numbers, pieces, units"`) | Numeric codes (`18`, `uoM: 5`) |
| Returns | `invoiceNumber` + per-item validation statuses | `result` = tracking number |
| Dry-run endpoint | **Yes** (`validateinvoicedata`) | **No** — every call is live |
| Test scenarios | **Yes**, `scenarioId` SN001–SN028 | No scenario concept |
| Debit/credit notes | `invoiceType: "Debit Note"` + `invoiceRefNo` | `invoiceType: 3` / `4` |
| Onboarding gate | Must pass FBR-assigned scenarios in sandbox | Register terminal, then post |

A business can be required to do **both** (a manufacturer with a retail outlet). If so, treat them as
two independent channels with their own tokens, their own settings, and a per-sale choice of which one
a given invoice goes to. Never post the same sale to both.

---

## 3. Prerequisites (business side — do this first, it takes days)

The seller must have, before you write any code:

1. **Active NTN / STRN** — sales-tax registered and active on FBR's ATL.
2. **IRIS login** for that NTN (`https://iris.fbr.gov.pk`).
3. **Business activity / sector correctly set in IRIS.** This is not cosmetic: FBR derives *which
   scenarios you must pass* from the declared sector. A wrong sector means you will be assigned
   scenarios you cannot legitimately produce.
4. **Correct registered province and address in IRIS.** Your payload's `sellerProvince` /
   `sellerAddress` must match FBR's record.

---

## 4. Getting the SANDBOX token

Done once, by the seller (or by you with their IRIS access). The token is a long-lived (5-year)
bearer token issued by PRAL.

1. Log in to **`https://iris.fbr.gov.pk`** with the seller's NTN credentials.
2. Open the **Digital Invoicing** area (in current IRIS it appears under the left menu as
   *Digital Invoicing* / *e-Invoicing*; on some profiles it is reached from **Registration →
   Form 181 / Licence Integration**).
3. Choose **Register for Digital Invoicing** and submit the integration request. Select
   **self-integration / in-house ERP** (not a licensed integrator) if you are writing the code.
4. Open the **Sandbox** tab. Two things appear there:
   - **Generate Token** → a GUID-style token. **It is shown once. Copy it immediately** into your
     password manager, then into your app's settings.
   - **The list of scenarios assigned to this seller** (a subset of SN001–SN028, chosen from the
     declared business activity). Write this list down — it is exactly what you must pass.
5. Store the token server-side only (encrypted config / secrets store). It is a 5-year credential
   for a taxpayer's identity. It must never reach the browser, a mobile app, or a git repository.

> If the *Digital Invoicing* menu is not visible, the NTN's profile is missing a sales-tax
> registration or the business activity is unset. That is an IRIS/registration fix, not an API fix.

---

## 5. Endpoints and authentication

| Purpose | Environment | URL |
|---|---|---|
| Post invoice (saves to FBR ledger) | Sandbox | `https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb` |
| Post invoice | Production | `https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata` |
| Validate only (no save) | Sandbox | `https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb` |
| Validate only | Production | `https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata` |

The environment is chosen **only** by the `_sb` suffix. Sandbox and production tokens are different
and are not interchangeable — a production token on a `_sb` URL returns 401.

Every request:

```
POST <url>
Authorization: Bearer <token>
Content-Type: application/json
```

**Design note:** store the base URL as configuration, not a constant, and derive the operation
segment at call time. That way one setting serves both post and validate, and FBR can move the host
without a code release.

### 5.1 Reference (lookup) APIs

Several payload fields must carry values FBR recognises *verbatim* — `sellerProvince`, `uoM`, `rate`,
`saleType`, `hsCode`, `sroScheduleNo`, `sroItemSerialNo`. FBR publishes read-only lookup APIs for
these under `https://gw.fbr.gov.pk/pdi/v1/...` (provinces, doctypecode, itemdesccode, transtypecode,
uom, SroSchedule, sroitemcode, and `pdi/v2/SaleTypeToRate`), plus `dist/v1/Get_Reg_Type` to check
whether a buyer NTN/CNIC is registered.

**Confirm the exact paths against §5 of the spec PDF issued with your token** — FBR has renumbered
them between releases. What matters for your build, whatever the paths turn out to be:

- **Cache them.** Pull each list on a schedule (nightly is plenty) into your own tables. Never call a
  lookup API inside an invoice-posting request.
- **Bind by value, not by index.** Store the FBR string (`"Numbers, pieces, units"`) on your
  product/UOM master, not a positional id.
- **Make them selectable in your UI.** HS code, UOM, sale type and SRO must be dropdowns sourced from
  the cached lists. Free text here is the single largest cause of production rejections.
- **Use `Get_Reg_Type` at buyer-entry time**, cached per buyer, to set `buyerRegistrationType`
  correctly (see error `0053` in §10).

---

## 6. The payload

One header, plus an `items` array. Field names are case-sensitive and must match exactly.

### 6.1 Header

| Field | Type | Required | Notes |
|---|---|---|---|
| `invoiceType` | string | yes | `"Sale Invoice"` or `"Debit Note"` |
| `invoiceDate` | string | yes | `"yyyy-MM-dd"` — date only, no time, no timezone |
| `sellerNTNCNIC` | string | yes | 7-digit NTN or 13-digit CNIC. Must match the token's owner |
| `sellerBusinessName` | string | yes | Exactly as FBR holds it |
| `sellerProvince` | string | yes | From the provinces lookup |
| `sellerAddress` | string | yes | Exactly as FBR holds it |
| `buyerNTNCNIC` | string | conditional | Required if registered; **omit the key entirely** if unregistered |
| `buyerBusinessName` | string | yes | |
| `buyerProvince` | string | yes | From the provinces lookup |
| `buyerAddress` | string | yes | |
| `buyerRegistrationType` | string | yes | `"Registered"` or `"Unregistered"` — cross-checked against the buyer's real FBR profile |
| `invoiceRefNo` | string | conditional | **Debit Note only.** The original FBR invoice number (22 chars for NTN, 28 for CNIC) |
| `scenarioId` | string | conditional | **Sandbox only.** e.g. `"SN001"`. Must be absent in production |
| `items` | array | yes | At least one |

### 6.2 Item

| Field | Type | Required | Notes |
|---|---|---|---|
| `hsCode` | string | yes | e.g. `"0101.2100"` — from the HS lookup |
| `productDescription` | string | yes | |
| `rate` | string | yes | The *string* from the rate lookup: `"18%"`, `"1%"`, `"Exempt"`, `"Rs.3"`, `"18% along with rupees 60 per kilogram"` |
| `uoM` | string | yes | From the UOM lookup, e.g. `"Numbers, pieces, units"` |
| `quantity` | decimal | yes | |
| `valueSalesExcludingST` | decimal | yes | Net of discount. **Must be > 0**, even for 3rd Schedule / exempt items |
| `fixedNotifiedValueOrRetailPrice` | decimal | yes | Retail price for 3rd Schedule items; `0` otherwise |
| `salesTaxApplicable` | decimal | yes | Sales tax / FED-in-ST-mode. Excludes further & extra tax |
| `salesTaxWithheldAtSource` | decimal | yes | `0` when the buyer is not a withholding agent |
| `extraTax` | number **or** `""` | yes in practice | See §7.2 — never `null`, never omitted |
| `furtherTax` | number **or** `""` | yes in practice | See §7.2 |
| `fedPayable` | decimal | optional | |
| `discount` | decimal | optional | |
| `saleType` | string | yes | From the transaction-type lookup — **exact string** |
| `sroScheduleNo` | string | optional | Required for schedule-driven sale types |
| `sroItemSerialNo` | string | optional | Send only when `sroScheduleNo` is present |
| `petroleumLevyOn` | decimal | conditional | **Required for `saleType: "Petroleum Products"`** (PDL/CSL, added 2026). Omit for every other sale type |
| `totalValues` | decimal | yes | See the formula in §7.1 |

---

## 7. Calculation rules

### 7.1 The formula FBR validates against

Compute per item, round each money field to 2 decimals:

```
valueSalesExcludingST = (unitPrice × quantity) − discount
fedPayable            = fixed  ? quantity × fedPerUnit
                               : valueSalesExcludingST × fedRate / 100     (0 if FED not applicable)
taxableValue          = valueSalesExcludingST + fedPayable
salesTaxApplicable    = taxableValue × taxRate / 100
extraTax              = buyerRegistered ? 0 : taxableValue × extraTaxRate   / 100
furtherTax            = buyerRegistered ? 0 : taxableValue × furtherTaxRate / 100
salesTaxWithheldAtSource = buyerIsWithholdingAgent ? salesTaxApplicable × whRate / 100 : 0

totalValues = taxableValue + salesTaxApplicable + extraTax + furtherTax − salesTaxWithheldAtSource
```

Two traps:
- **FED is inside the sales-tax base.** Tax is charged on `valueSalesExcludingST + fedPayable`, not on
  the net value alone.
- **Further tax and extra tax apply to unregistered buyers only.** Driving them off
  `buyerRegistrationType` (not off a per-customer checkbox someone forgot to tick) keeps them correct.

For **3rd Schedule** items, `salesTaxApplicable` is computed on `fixedNotifiedValueOrRetailPrice`, not
on `valueSalesExcludingST` — but `valueSalesExcludingST` must still be sent and must still be > 0.

### 7.2 `extraTax` / `furtherTax` — the serialization trap

FBR wants these keys **always present**, but the accepted "no value" form depends on the sale type:

| Situation | Send |
|---|---|
| Tax applies | the number, e.g. `120.00` |
| Standard-rate sale, no extra/further tax | `0` **or** `""` — both accepted |
| Reduced-rate / exempt / zero-rated sale types | `""` — a numeric `0` is rejected with `[0091]` |
| Any case | **never** `null`, **never** omit the key — rejected with `[0300]` |

Most JSON serializers drop nulls or write `null`. You need an explicit converter that emits `""` for
"not applicable". Verify by logging the exact outbound JSON string, not your object.

### 7.3 Other serialization rules

- `invoiceDate` is a **date string**, not an ISO timestamp. `"2026-09-01"`, never `"2026-09-01T00:00:00Z"`.
- Serialize with **invariant culture**. A machine with a European locale writing `1000,50` fails.
- Omit optional keys that are `null`; do not send `"key": null`.
- Strip `scenarioId` in production — sending it is a rejection.
- `buyerNTNCNIC` for an unregistered buyer: omit the key rather than sending `""`.

---

## 8. Handling the response

### 8.1 Success

```json
{
  "invoiceNumber": "7000007DI1747119701593",
  "dated": "2025-05-13 12:01:41",
  "validationResponse": {
    "statusCode": "00",
    "status": "Valid",
    "error": "",
    "invoiceStatuses": [
      { "itemSNo": "1", "statusCode": "00", "status": "Valid",
        "invoiceNo": "7000007DI1747119701593-1", "errorCode": "", "error": "" }
    ]
  }
}
```

`validateinvoicedata` returns the same shape **without** `invoiceNumber` — that is expected, not a bug.

### 8.2 The three failure modes you must all handle

**HTTP 200 does not mean accepted.** Treat the invoice as accepted only when *all three* hold:
`validationResponse.statusCode == "00"`, `status` equals `"Valid"` (case-insensitively), **and**
every entry in `invoiceStatuses` has `statusCode == "00"`.

1. **Header-level rejection** — `statusCode: "01"`, `invoiceStatuses: null`. e.g. bad HS code.
2. **Item-level rejection with a "00" header** — the header says `"00"` while an item says `"01"`.
   A naive `if (statusCode == "00") success` marks a rejected invoice as filed. This is the most
   common integration bug in the wild.
3. **HTTP-level failure** — `401` (token invalid/missing), `500` (FBR side), timeout, or a 2xx whose
   body is an HTML gateway page rather than JSON.

Aggregate every error into one message the user can act on: `[0046] Item #1: Provide rate.`

### 8.3 Parse leniently

FBR's responses are not strictly spec-clean. Configure your JSON reader to allow trailing commas and
to read a JSON **number** into a string field (`invoiceNo: 0` happens). A strict parser throws and you
lose the real error message, reporting "invalid JSON" instead of "Provide rate."

---

## 9. Posting flow inside your application

```
User saves a sale
   └─ your app validates + saves it locally (status: NotSubmitted)
         └─ build FBR payload from the saved record
               └─ POST postinvoicedata
                     ├─ Accepted  → store invoiceNumber + dated,
                     │              set status Submitted, LOCK the record from edit/delete
                     └─ Rejected  → store the error, leave status NotSubmitted, invoice stays editable
```

Non-negotiables:

- **Never post inside your database transaction.** Commit the sale first, then call FBR. A network
  timeout must not roll back a real sale — and it must not create a sale that FBR has accepted while
  your database has nothing.
- **Idempotency: never auto-retry a timed-out post.** FBR may have accepted it. Mark it "unknown"
  and let a human resolve it, or re-submit only after confirming with FBR. A blind retry produces a
  duplicate legal invoice that can only be undone with a Debit Note.
- **Lock accepted invoices.** No edit, no delete, no date change once `invoiceNumber` exists.
- **Offer both an inline mode and a queue.** Inline ("submit on save") is what most sellers want;
  a queued/manual "e-Invoice register" screen is what saves them when FBR is down. Build the register
  first: a list of sales with their FBR status, and Validate / Post buttons per row.
- **Corrections go through a Debit Note** — `invoiceType: "Debit Note"` with `invoiceRefNo` set to the
  original FBR invoice number.

---

## 10. Error codes seen in practice

| Code | Message | Cause / fix |
|---|---|---|
| `0046` | Provide rate. | `rate` missing or not a lookup string. |
| `0052` | Provide proper HS Code | `hsCode` not in FBR's list, or wrong format. |
| `0053` | Registration type does not match buyer's profile | `buyerRegistrationType` contradicts FBR's record for that NTN/CNIC. Dummy 13-digit CNICs (`10000000000xx`) must be `"Unregistered"`; `2046004` is the known **Registered** sandbox NTN. Use `Get_Reg_Type` to decide. |
| `0091` | — | A numeric `0` sent in `extraTax`/`furtherTax` for a reduced-rate sale type. Send `""`. |
| `0129` | Petroleum Levy On field cannot be empty or null | `petroleumLevyOn` missing on a `"Petroleum Products"` item. |
| `0203` | Provided scenario does not exist | The `scenarioId` is not in *this seller's* assigned list in IRIS → Sandbox. Registration-side; not fixable in the payload. |
| `0204` | Sale type not match with provided scenario No. | `saleType` string differs from FBR's registry. Note SN024's registry string is `Goods as per SRO.297(\|)/2023` — a pipe character, not the letter I. |
| `0300` | Provided numeric values are invalid … | A required numeric is `null`/omitted, or `valueSalesExcludingST` is `0`. It must be > 0 even for 3rd Schedule and exempt items. |
| HTTP 401 | — | Wrong token, or a sandbox token on a production URL (or vice versa). |

---

## 11. Sandbox → production

1. Configure the sandbox URL + sandbox token in your app.
2. Open `fbr-test-harness.html`, paste the token, run **Validate All** across your assigned scenarios.
   Fix payload bugs here — `validateinvoicedata` writes nothing.
3. Switch the harness to **Post** and run each assigned scenario against `postinvoicedata_sb` until
   every one returns `statusCode: "00"` / `"Valid"` with an `invoiceNumber`.
4. Repeat from **your own application**, not just the harness — the harness proves the payload,
   the app proves your mapping.
5. In IRIS → Digital Invoicing → Sandbox, confirm every assigned scenario shows as completed.
6. The **Production** tab unlocks. Generate the production token there. Copy it once.
7. In your app: set the production URL and token, turn the sandbox switch **off**, and confirm
   `scenarioId` is no longer being sent.
8. Post **one real low-value invoice** and verify it appears in IRIS before switching the seller over.

---

## 12. Printing (mandatory)

Once accepted, the printed invoice must carry:

- the **FBR invoice number**, and
- a **QR code encoding that number** (1 inch × 1 inch is the accepted size), and
- the **FBR Digital Invoicing logo**.

Generate the QR client-side from the stored `invoiceNumber` — do not fetch it from FBR. Render the
block only when the invoice actually has an FBR number, so unsubmitted drafts do not print a fake mark.

---

## 13. Data your app must store

Per company/seller (settings, token encrypted): seller NTN/CNIC, business name, province, address;
production URL + token; sandbox URL + token; sandbox on/off; default scenario id; "submit on save" on/off.

Per invoice: `eInvoiceNumber` (FBR's), `eInvoiceDate` (FBR's `dated`), submission status, the channel
used (DI vs POS), the last error text, and the exact JSON you sent. **Keep the sent payload** — when
FBR disputes an invoice a year later, the payload is the only evidence of what you filed.

Per product: HS code, UOM (FBR string), sale type, tax rate, SRO schedule no, SRO item serial no,
FED applicability + rate/type, fixed notified value.
Per customer: NTN/CNIC, business name, province, address, registered/unregistered, withholding-agent
flag + rate, further-tax rate, extra-tax rate.

---

## 14. Go-live checklist

- [ ] Seller NTN active; business activity and province correct in IRIS
- [ ] Sandbox token generated and stored server-side (encrypted)
- [ ] Lookup lists cached locally and selectable in the UI (HS, UOM, sale type, rate, SRO, province)
- [ ] Products and customers carry every FBR field listed in §13
- [ ] Payload verified as a raw string: date format, invariant numbers, `extraTax`/`furtherTax` shape
- [ ] All FBR-assigned scenarios pass `validateinvoicedata_sb` **and** `postinvoicedata_sb`
- [ ] Response handler treats item-level `"01"` under a header `"00"` as a rejection
- [ ] FBR call is outside the DB transaction; timeouts are never auto-retried
- [ ] Accepted invoices are locked from edit/delete
- [ ] Debit Note path implemented with `invoiceRefNo`
- [ ] QR + FBR number + logo print on accepted invoices only
- [ ] Production token stored; sandbox switch off; `scenarioId` not sent
- [ ] One real invoice posted and verified in IRIS
