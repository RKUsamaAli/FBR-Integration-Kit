# FBR POS Digital Invoicing — Developer Integration Guide

**Audience:** a developer integrating FBR POS Digital Invoicing into an application from scratch.
**Scope:** terminal registration → sandbox token → sandbox verification → production token → live posting → printing.
**Companion files:** `fbr-test-harness.html` (browser test runner), `fbr-proxy.js` (CORS relay).
**Reference spec:** `../Technical-Specification-POS-Digital-Invoicing.md`

---

## 1. What POS DI is

POS Digital Invoicing is FBR's **retail till reporting** channel. Every receipt a registered Tier-1
retail outlet prints is POSTed to FBR at the moment of sale. FBR returns a **tracking number**
(e.g. `900005CLNP5914173522`) which, with a QR code, must be printed on the customer's receipt so the
customer can verify it (the "Tax Asaan" verification the FBR prize scheme runs on).

The unit of registration is the **terminal**, not the invoice. Each till/counter is registered
separately and gets its own **BPOS ID**, which is sent in every payload from that till.

---

## 2. POS vs Digital Invoicing (DI) — read this before choosing

They are **two different APIs with two different payloads, two different tokens and two different
onboarding paths.** They are not versions of each other.

| | **POS Digital Invoicing** | **Digital Invoicing (DI)** |
|---|---|---|
| Purpose | Retail receipt reporting (SRO 1006) | Legal sales-tax invoice register |
| Typical user | Tier-1 retailer, restaurant, outlet counter | Manufacturer, importer, distributor, wholesaler |
| Registers | The **terminal** (BPOS ID per till) | The **invoice** |
| Endpoint family | `.../pdi/v1/api/DigitalInvoicing/PostInvoiceData_v1` | `.../di_data/v1/di/postinvoicedata` |
| Field style | **Numeric codes** — `uoM: 5`, `saleType: 1`, `rate: 18` | **Descriptive strings** — `"Numbers, pieces, units"`, `"18%"` |
| `invoiceType` | `1` Purchase, `2` Sale, `3` Debit Note, `4` Credit Note | `"Sale Invoice"` / `"Debit Note"` |
| Success signal | `statusCode: 200` (a **number**) + `result` = tracking number | `validationResponse.statusCode: "00"` (a **string**) + `invoiceNumber` |
| Per-item validation | No — one verdict for the whole invoice | Yes — per-item statuses |
| Dry-run endpoint | **None. Every call is live.** | `validateinvoicedata` |
| Test scenarios | None | `scenarioId` SN001–SN028, assigned per seller |
| Header totals | Required (`totalSalesTaxApplicable`, `totalRetailPrice`, …) | Not sent — FBR derives them |

**The consequence that catches people:** POS has no validate endpoint, so you cannot rehearse a
payload without creating a record. Test against the **sandbox URL** only, and treat every production
call as final.

A business can be required to run both channels. If so, keep two independent settings blocks and two
tokens, and make the cashier (or a rule) pick exactly one channel per sale. Never post one sale to both.

---

## 3. Prerequisites (business side)

1. Active **NTN / STRN**, sales-tax registered.
2. **IRIS login** for that NTN (`https://iris.fbr.gov.pk`).
3. The outlet is **declared in IRIS** — POS registration is per business premises. Every branch must
   exist as a business address on the profile before its tills can be registered.
4. The seller understands that a registered terminal is a **monitored** terminal: FBR expects
   continuous posting from it once it is live.

---

## 4. Registering the terminal and getting the SANDBOX token

1. Log in to **`https://iris.fbr.gov.pk`** (the older `e.fbr.gov.pk` portal redirects here).
2. Go to **Registration → POS Registration** (also surfaced as *Integration → POS*).
3. **Register each terminal**: select the branch/business premises, give the till a name, submit.
   FBR issues a **POS ID / BPOS ID** per terminal. Record which physical counter each ID belongs to —
   your app needs to send the right one per till.
4. Pay the annual per-terminal registration fee if IRIS prompts for it; the terminal is not active
   until it is paid.
5. In the **Integration / Digital Invoicing** section, request the **security token**. FBR issues one
   token for the taxpayer (not one per till); the BPOS ID in the payload identifies the terminal.
   **The token is displayed once — copy it immediately.**
6. Store the token server-side, encrypted. Never ship it to a browser, a till app binary, or git.

For a first smoke test before the seller's own token arrives, FBR's spec publishes the shared sandbox
token `07eabd29-fb34-3a2a-ab73-1ff4eb282aef`. Use it to prove your payload shape only — never for
anything you intend to keep.

---

## 5. Endpoints and authentication

| Environment | URL |
|---|---|
| Sandbox (testing) | `https://esp.fbr.gov.pk:8244/DigitalInvoicing/v1/PostInvoiceData_v1` |
| Production (live) | `https://gw.fbr.gov.pk/pdi/v1/api/DigitalInvoicing/PostInvoiceData_v1` |

Unlike DI, the sandbox is a **different host**, not a URL suffix. Keep both as configuration.

```
POST <url>
Authorization: Bearer <token>
Content-Type: application/json
```

### 5.1 Code lists

POS fields are **numeric codes**, and FBR publishes the lists (HS Code, UoM, Sale Type, SRO/Schedule,
Rate) on the FBR website / with the spec rather than as a live API. Import them into your own tables
and expose them as dropdowns on the product master. Never let a cashier type a UoM or sale-type code.

Getting a code wrong here is worse than in DI: POS validates loosely at the API boundary, so a wrong
`saleType` or `uoM` is *accepted* and becomes a wrong filing that surfaces months later in the
seller's return. Verify your codes in the sandbox against a known-good sale before go-live.

---

## 6. The payload

One header carrying **document totals**, plus an `invoiceItemDetails` array. Field casing is exact —
note the unusual `ntN_CNIC`, `distributor_NTN_CNIC`, `whiT_1`.

### 6.1 Header

| Field | Type | Required | Notes |
|---|---|---|---|
| `bposId` | string | yes | The registered terminal ID for this till |
| `invoiceType` | string | yes | `"1"` Purchase, `"2"` Sale, `"3"` Debit Note, `"4"` Credit Note |
| `invoiceDate` | string | yes | `"yyyy-MM-dd"` |
| `ntN_CNIC` | string | yes | The **counterparty**: on a sale, the buyer's NTN/CNIC. Open text — not validated live |
| `buyerSellerName` | string | yes | Counterparty name |
| `destinationAddress` | string | yes | |
| `saleType` | number | yes | Code from FBR's Sale Type list |
| `distributor_NTN_CNIC` | string | yes in practice | **The seller** (your taxpayer) |
| `distributorName` | string | yes in practice | Seller's registered name |
| `totalSalesTaxApplicable` | decimal | optional | Sum over items |
| `totalRetailPrice` | decimal | yes | Sum over items |
| `totalSTWithheldAtSource` | decimal | optional | Sum over items |
| `totalExtraTax` | decimal | optional | Sum over items |
| `totalFEDPayable` | decimal | optional | Sum over items |
| `totalWithheldIncomeTax` | decimal | optional | Sum of `whiT_1 + whiT_2` |
| `totalCVT` | decimal | optional | Sum over items |
| `invoiceItemDetails` | array | yes | At least one |

**The header totals must equal the sum of the item lines.** Compute them from the mapped item array
you are about to send — never from your own screen totals, which may round differently.

### 6.2 Item (`invoiceItemDetails[]`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `hsCode` | string | yes | 8 characters, from the HS list |
| `productCode` | string | yes | Your own SKU — open text |
| `productDescription` | string | yes | |
| `rate` | decimal | yes | A **number** (`18`), not `"18%"` |
| `uoM` | number | yes | Code from the UoM list |
| `quantity` | decimal | yes | |
| `valueSalesExcludingST` | decimal | yes | 2 dp |
| `salesTaxApplicable` | decimal | yes | 2 dp |
| `retailPrice` | decimal | yes | Retail / fixed notified value |
| `stWithheldAtSource` | decimal | optional | |
| `extraTax` | decimal | optional | Plain number — POS has none of DI's `""` quirk |
| `furtherTax` | decimal | optional | |
| `sroScheduleNo` | number | optional | Numeric code |
| `fedPayable` | decimal | optional | |
| `cvt` | decimal | yes | `0` when not applicable |
| `whiT_1`, `whiT_2` | decimal | optional | Withholding income tax |
| `whiT_Section_1`, `whiT_Section_2` | string | optional | Send `""` when not applicable |
| `totalValues` | decimal | yes | Item total including tax |

### 6.3 Worked example

```json
{
  "bposId": "05",
  "invoiceType": "2",
  "invoiceDate": "2026-09-01",
  "ntN_CNIC": "3520212345671",
  "buyerSellerName": "Walk-in Customer",
  "destinationAddress": "Lahore",
  "saleType": 1,
  "distributor_NTN_CNIC": "8885801",
  "distributorName": "Demo Traders (Pvt) Ltd",
  "totalSalesTaxApplicable": 180.00,
  "totalRetailPrice": 0.00,
  "totalSTWithheldAtSource": 0.00,
  "totalExtraTax": 0.00,
  "totalFEDPayable": 0.00,
  "totalWithheldIncomeTax": 0.00,
  "totalCVT": 0.00,
  "invoiceItemDetails": [
    {
      "hsCode": "0101.2100",
      "productCode": "SKU-001",
      "productDescription": "Demo product",
      "rate": 18,
      "uoM": 5,
      "quantity": 1,
      "valueSalesExcludingST": 1000.00,
      "salesTaxApplicable": 180.00,
      "retailPrice": 0.00,
      "stWithheldAtSource": 0.00,
      "extraTax": 0.00,
      "furtherTax": 0.00,
      "sroScheduleNo": 0,
      "fedPayable": 0.00,
      "cvt": 0.00,
      "whiT_1": 0.00,
      "whiT_2": 0.00,
      "whiT_Section_1": "",
      "whiT_Section_2": "",
      "totalValues": 1180.00
    }
  ]
}
```

---

## 7. Calculation rules

Per item, rounded to 2 decimals:

```
valueSalesExcludingST = (unitPrice × quantity) − discount
fedPayable            = fixed ? quantity × fedPerUnit
                              : valueSalesExcludingST × fedRate / 100      (0 if not applicable)
taxableValue          = valueSalesExcludingST + fedPayable
salesTaxApplicable    = taxableValue × rate / 100
extraTax              = buyerRegistered ? 0 : taxableValue × extraTaxRate   / 100
furtherTax            = buyerRegistered ? 0 : taxableValue × furtherTaxRate / 100
stWithheldAtSource    = buyerIsWithholdingAgent ? salesTaxApplicable × whRate / 100 : 0

totalValues = taxableValue + salesTaxApplicable + extraTax + furtherTax − stWithheldAtSource
```

Then set each header `total*` to the sum of the corresponding item column. As in DI, FED sits **inside**
the sales-tax base, and further/extra tax apply to unregistered buyers only.

---

## 8. Handling the response

### 8.1 Success

```json
{
  "$id": "1",
  "version": "1.0",
  "statusCode": 200,
  "errorMessage": "",
  "result": "900005CLNP5914173522",
  "timestamp": "2023-12-20T16:59:15.4831026+05:00",
  "errors": { "$id": "2", "$values": [] }
}
```

`result` is the **tracking number**. It is the whole point of the call — store it and print it.

### 8.2 The checks you must implement

Treat the sale as filed only when **all three** hold:

1. HTTP status is 2xx, **and**
2. the body's `statusCode` is `200` (a JSON **number**, not the string `"00"` DI uses), **and**
3. `result` is non-empty.

FBR can return **HTTP 200 with a body `statusCode` other than 200** and an `errorMessage`. A handler
that only checks the HTTP status will record failed sales as filed.

Also handle: `401` (token invalid or missing), `500` (FBR side), timeout, and a 2xx whose body is an
HTML gateway page rather than JSON — surface the first 500 characters of the body so the real cause
is visible instead of "invalid JSON".

Parse leniently (allow trailing commas; read a JSON number into a string field) — POS replies are not
strictly spec-clean either.

---

## 9. Posting flow inside your application

```
Cashier saves the sale
   └─ app saves it locally (status: NotSubmitted)
         └─ build POS payload (right bposId for this till)
               └─ POST PostInvoiceData_v1
                     ├─ statusCode 200 + result → store tracking number, LOCK the sale, print receipt
                     └─ anything else           → store errorMessage, sale stays editable, retry from the register
```

Non-negotiables:

- **There is no validate endpoint.** Every call writes. Rehearse on the sandbox host only.
- **Post outside the DB transaction.** Commit the sale first, then call FBR.
- **Never auto-retry a timeout** — FBR may have recorded it. Mark it "unknown" and resolve manually;
  a blind retry double-files the sale, and the only fix is a Credit Note (`invoiceType: 4`).
- **Lock a sale once it has a tracking number.**
- **Build an e-invoice register screen** — a list of sales with their POS status and a manual Post
  button — before you build "submit on save". Tills lose connectivity; the register is how the day
  gets reconciled.
- **Map each till to its own BPOS ID.** One hard-coded BPOS ID across a multi-counter shop files every
  counter's sales against one terminal.
- **Returns** go as `invoiceType: "4"` (Credit Note).

---

## 10. Sandbox → production

1. Configure the sandbox URL + token in your app.
2. Open `fbr-test-harness.html`, switch to **POS**, paste the token and BPOS ID, and post the sample
   payload. Confirm you get `statusCode: 200` and a `result` tracking number.
3. Cover your real cases against the sandbox host: standard-rate sale, an exempt/zero-rated item,
   a multi-item receipt, a discounted line, a return (`invoiceType: 4`), and an unregistered buyer.
   Check each returned tracking number is stored and printed.
4. Verify your **code mappings**: run one sale per distinct UoM and sale type your catalogue uses, and
   confirm the codes match FBR's published lists. The API will not catch a wrong-but-valid code.
5. Confirm in IRIS that the terminal is registered, the fee is paid, and the terminal is active.
6. Switch the app to the production URL + production token, sandbox switch **off**.
7. Post **one real low-value sale**, verify the tracking number scans in FBR's verification app, then
   roll out to the remaining tills.

---

## 11. Printing (mandatory)

The receipt must carry:

- the **tracking number** returned in `result`, and
- a **QR code encoding that tracking number** (1 inch × 1 inch), and
- the **FBR POS logo**.

Generate the QR locally from the stored tracking number. Print the block only when a tracking number
exists, so an unfiled receipt never carries a fake FBR mark. On thermal roll paper, place the QR and
number at the foot of the receipt above the footer text and check it scans at your printer's actual DPI.

---

## 12. Data your app must store

Per company/seller (token encrypted): seller NTN/CNIC, business name; production URL + token;
sandbox URL + token; sandbox on/off; "submit on save" on/off.
Per till/location: the **BPOS ID**.
Per sale: tracking number, submission timestamp, the channel used (POS vs DI), the last error text,
and the exact JSON you sent.
Per product: HS code, UoM code, sale type code, rate, SRO schedule code, FED applicability + rate/type,
retail/fixed notified price.
Per customer: NTN/CNIC, name, address, registered/unregistered, withholding-agent flag + rate.

---

## 13. Go-live checklist

- [ ] Every terminal registered in IRIS; BPOS ID recorded per physical till; fee paid
- [ ] Sandbox token stored server-side (encrypted); production token obtained separately
- [ ] FBR code lists (HS, UoM, sale type, SRO, rate) imported and selectable in the UI
- [ ] Header `total*` fields computed from the mapped item array, not from screen totals
- [ ] Success check requires HTTP 2xx **and** body `statusCode == 200` **and** non-empty `result`
- [ ] Non-JSON / HTML gateway responses surfaced with their raw body
- [ ] FBR call is outside the DB transaction; timeouts are never auto-retried
- [ ] Sales with a tracking number are locked from edit/delete
- [ ] Return path posts `invoiceType: 4`
- [ ] E-invoice register screen with a manual Post/retry per sale
- [ ] Tracking number + QR + FBR logo print, and the QR scans on the real printer
- [ ] Production URL + token set, sandbox switch off, one real sale verified
