# FBR IMS (Tier-1 / Income Tax POS) — Developer Integration Guide

**Audience:** a developer integrating a point-of-sale or billing system with FBR's **IMS Software
Fiscal Component**: Tier-1 retailers under the Sales Tax Rules, and businesses notified for
**income-tax POS integration** (hospitals, clinics, labs, restaurants, hotels, …).
**Scope:** POS registration → test POS ID → sandbox posting → production → receipt printing.
**Companion files:** `fbr-test-harness.html` (IMS Tester tab), `fbr-ims-test-scenarios.json` (ready-made
payloads), `fbr-proxy.js` (CORS relay).
**Source spec:** FBR *Technical Specification for Data Sharing through Software Fiscal Component from
TIER 1 Retailer with FBR* (the "FBR Technical Assistant" PDF in this folder).

---

## 1. What IMS is

IMS is FBR's **invoice fiscalization** system. Every bill your POS prints is sent to FBR. FBR returns
a **Fiscal Invoice Number** (19–30 digits, e.g. `9000052011142444901`). You print that number and a
QR code on the customer's receipt.

There are two ways to connect, and the payload is identical in both:

| | **Cloud (direct API)** | **Local Fiscal Component** |
|---|---|---|
| How | Your server POSTs to FBR's API over HTTPS | A Windows service FBR provides runs on the POS PC; your POS POSTs to it on `localhost`, and it uploads to FBR in the background |
| Auth | `Authorization: Bearer <token>` | None on localhost. The **Access Code** is entered once in the installer |
| Fits | Web/cloud billing systems, multi-branch HMS/ERP | Desktop POS on Windows PCs at each counter |
| POS type in registration | **Cloud Based** | **Client Server** |
| Internet at sale time | Required | Not required (the component queues and syncs) |

Pick one per POS ID. A web-based hospital system almost always wants **Cloud**.

---

## 2. IMS is not the other two FBR APIs

FBR runs three separate e-invoicing channels. They differ in endpoints, payloads, tokens and success
codes. A payload built for one is rejected by the others.

| | **IMS (this guide)** | **POS Digital Invoicing** | **Digital Invoicing (DI)** |
|---|---|---|---|
| Who | Tier-1 retailers; income-tax-notified businesses (hospitals, clinics, restaurants…) | Retail tills under PRAL's POS DI | Manufacturers, distributors, wholesalers |
| Sandbox | `esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData` | `esp.fbr.gov.pk:8244/DigitalInvoicing/v1/PostInvoiceData_v1` | `gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb` |
| Production | `gw.fbr.gov.pk/imsp/v1/api/Live/PostData` | `gw.fbr.gov.pk/pdi/v1/api/DigitalInvoicing/PostInvoiceData_v1` | `gw.fbr.gov.pk/di_data/v1/di/postinvoicedata` |
| Field style | **PascalCase**: `POSID`, `USIN`, `TotalBillAmount` | camelCase: `bposId`, `totalValues` | camelCase: `sellerNTNCNIC` |
| Terminal ID | `POSID` (number) | `bposId` (string) | none |
| Item code | `PCTCode`, 8 digits, no dot | `hsCode` `"0101.2100"` | `hsCode` `"0101.2100"` |
| Success | `Code == "100"` + `InvoiceNumber` | `statusCode == 200` + `result` | `statusCode == "00"` + `invoiceNumber` |
| Dry run | **None** | None | `validateinvoicedata` |

If the registration screen you used was **e.fbr → Registration → POS Client Registration**, you are
on IMS. That is the screen with the "Register for: Income Tax / Sales Tax (SRO 779(I)/2020)" option.

---

## 3. Prerequisites (business side)

1. An active **NTN** for the business, and an **IRIS login** (`https://iris.fbr.gov.pk`; the older
   `https://e.fbr.gov.pk` address redirects there).
2. Every **branch** you will register exists on the IRIS profile as a business premises.
3. For each billing counter: a name, and the PC's **MAC address** and **IP address** (the registration
   form asks for both, even for cloud systems; give the billing server's values in that case).
4. Decide **Cloud vs Local** (§1) before registering. It is the "POS type" field.
5. Which law obliges you to integrate. Retailers usually register for **Sales Tax** (Tier-1, Chapter
   XIV-AA of the Sales Tax Rules 2006). Businesses notified for income-tax integration (SRO
   779(I)/2020, extended by SRO 428(I)/2024, e.g. hospitals, clinics and labs) register for
   **Income Tax**. Confirm the right one with your tax advisor; it changes how FBR treats the data.

---

## 4. Registering the POS and getting the test POS ID

Log in to IRIS / e.fbr and open **Registration → POS Client Registration**. The form has four parts.

### 4.1 Business Information

| Field | Required | What to enter |
|---|---|---|
| NTN, Business Name | auto | From your profile |
| STRN | no | Sales-tax registration number, if any |
| Brand Name | no | Trading name, e.g. the hospital's name |
| Products | no | e.g. "Medical consultation, room charges" |
| **Register for** | **yes** | **Income Tax** or **Sales Tax** (§3.5) |
| Manufacturer | yes | No, for service providers and retailers |
| Estimated annual turnover / transactions per day | no | Rough figures |
| Website URL | no | |
| POS software name / technologies / vendor | no | Your billing system, its stack, who supplies it |
| **POS type** | **yes** | **Cloud Based** or **Client Server** (§1) |
| In-house software development | yes | Yes if your own team builds it |
| Number of technical staff | no | |

### 4.2 Contact Information

Add at least one **General** contact and one **Technical** contact (name, mobile, email, address).
The branch screen only lets you pick from the General contacts, so create those first.

### 4.3 Branch Information (one per branch)

Branch name, city, **weekly off days** (when no bills are expected), **sector**, address, contact
person, **latitude/longitude**, version, franchise yes/no, store timings from/to.

Get the off days and timings right. FBR monitors registered POS IDs, and a POS that goes quiet during
declared opening hours draws attention.

### 4.4 POS Details (one per billing counter)

| Field | What to enter |
|---|---|
| POS Branch | The branch from §4.3 |
| POS Identification Number | Your own unique name for the counter, e.g. `OPD-RECEPTION-1` |
| POS Type | Usually **Primary** for a counter used daily |
| MAC address, IP address | Of that counter's PC (or of the billing server for cloud) |

### 4.5 Generate Test POS

Open the **Generate Test POS** tab and click **Generate Test POS IDs**. IRIS lists test IDs like this:

| Seq. No | Pos Registration Number | BusinessName | Code | |
|---|---|---|---|---|
| 1 | `822922` | YOUR BUSINESS NAME | `A6F41649` | Reset POSID |

- **Pos Registration Number** is the **test POSID**. It goes in the `POSID` field of every sandbox
  payload.
- **Code** is the **Access Code** for the local Fiscal Component installer (§5). It is **not** a Bearer
  token.
- **Reset POSID** reissues a test ID. You only need it if one stops working.

Keep a table of *physical counter → test POS ID → production POS ID*.

### 4.6 Tokens and access codes

| Environment | Cloud (Bearer token) | Local component |
|---|---|---|
| **Sandbox** | The **shared sandbox token** from the spec, `1298b5eb-b252-3d97-8622-a4a69d5bf818`, used with **your own test POSID**. Checked October 2026: it opens `esp.fbr.gov.pk:8244/FBR/v1` | Test POSID + the **Code** from §4.5, with **Test** chosen in the installer |
| **Production** | The token FBR issues for your **production** POS registration. It is accepted only on `gw.fbr.gov.pk/imsp/...` and gets `900908` on the sandbox | Production POS registration number + its access code, with **Production** chosen |

- Use **Check token** in the IMS Tester to see which environment a token opens. It sends an empty
  body, so nothing is filed.
- Never put the shared sandbox POSID `110014` in your own tests. Use your own test POSID, so the bills
  show up against your registration.
- The **production** token is a long-lived credential for the taxpayer's identity. Store it
  **server-side, encrypted**. Never in a browser, a desktop binary, git, or a chat message. If it has
  been exposed, ask FBR to reissue it.

---

## 5. Installing the Local Fiscal Component (Client Server only)

Skip this section for Cloud.

**Prerequisites on each POS PC:** Windows 7 or later, **IIS** enabled, **.NET Framework 4.5+**,
an administrator account, and internet during installation.

1. Download `https://download.fbr.gov.pk/IMS_Setup/FBRIMS.zip` and unzip it.
2. Run `Setup.exe` **as administrator** and choose **Complete**.
3. Enter the **POS Registration Number**, the **Access Code**, and **Test** (for sandbox) or
   **Production**.
4. **Browse** to the folder where the component keeps its local files. FBR recommends a drive other
   than `C:`.
5. **Install**, then **Finish**.
6. Check the service is listed and running in `services.msc`.
7. Open `http://localhost:8524/api/IMSFiscal/get` in a browser. It should return
   `["Service is responding"]`.

**Moving from test to live:** don't uninstall from Control Panel. Run `Setup.exe` again, answer
**Yes** to the upgrade prompt, choose **Remove**, finish, then install again with **Production**
selected.

---

## 6. Endpoints and authentication

| Mode | Environment | Method + URL | Auth |
|---|---|---|---|
| Cloud | Sandbox | `POST https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData` | Bearer token |
| Cloud | Production | `POST https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData` | Bearer token |
| Local | (set at install) | `POST http://localhost:8524/api/IMSFiscal/GetInvoiceNumberByModel` | none |
| Local | health check | `GET http://localhost:8524/api/IMSFiscal/Get` | none |

```
POST <url>
Authorization: Bearer <token>        (cloud only)
Content-Type: application/json
```

Keep the URLs in configuration, not code. The sandbox and production hosts are different.

**Do not copy the spec's `ServerCertificateValidationCallback = delegate { return true; }` line.**
It turns off HTTPS certificate checking. Both FBR hosts present valid DigiCert certificates (checked
October 2026), so it is not needed. With it in place, anyone on the network path could read the token.

---

## 7. The payload

One bill header plus an `Items` array. Field names are **PascalCase** and must match exactly.

### 7.1 Header

| Field | Type | Required | Notes |
|---|---|---|---|
| `InvoiceNumber` | string | yes, blank | Always send `""`. FBR fills it in |
| `POSID` | number | yes | The FBR POS ID (test or production) for this counter |
| `USIN` | string ≤50 | yes | **Your own bill number.** Unique per POS. Never reuse it, even after a failed send that FBR may have recorded |
| `RefUSIN` | string ≤50 | for Debit/Credit | The `USIN` of the original bill. `null` for a new bill |
| `DateTime` | string | yes | `"yyyy-MM-dd HH:mm:ss"`, local time of the sale |
| `BuyerName` | string ≤150 | no | |
| `BuyerNTN` | string ≤9 | no | `"1234567-8"` format |
| `BuyerCNIC` | string ≤13 | no | **13 digits, no dashes.** The spec's sample shows dashes, which overruns the field length |
| `BuyerPhoneNumber` | string ≤20 | no | |
| `TotalSaleValue` | number | yes | Sum of item `SaleValue` |
| `TotalTaxCharged` | number | yes | Sum of item `TaxCharged` |
| `TotalQuantity` | number | yes | Sum of item `Quantity` |
| `Discount` | number | no | Sum of item `Discount` |
| `FurtherTax` | number | no | Sum of item `FurtherTax` |
| `TotalBillAmount` | number | yes | Sum of item `TotalAmount` |
| `PaymentMode` | number | yes | `1` Cash, `2` Card, `3` Gift Voucher, `4` Loyalty Card, `5` Mixed, `6` Cheque |
| `InvoiceType` | number | yes | `1` New, `2` Debit, `3` Credit |
| `Items` | array | yes | At least one item |

> **The spec's numbering is broken.** It prints the PaymentMode list as 21–26 and the InvoiceType
> list as 27–29. That is a document-formatting error. The real codes are 1–6 and 1–3, as above.

### 7.2 Item (`Items[]`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `ItemCode` | string ≤50 | yes | Your own service/product code |
| `ItemName` | string ≤150 | yes | |
| `PCTCode` | string ≤8 | yes | Pakistan Customs Tariff / service heading, **digits only**: `9815.1000` → `"98151000"` |
| `Quantity` | number | yes | Days, visits, units… |
| `TaxRate` | number | yes | Percent as a number: `18`, `0`. Not `"18%"` |
| `SaleValue` | number | yes | Value the tax is calculated on, **after discount, before tax** |
| `Discount` | number | no | Discount given on the line (already removed from `SaleValue`) |
| `TaxCharged` | number | yes | `SaleValue × TaxRate / 100` |
| `FurtherTax` | number | no | |
| `TotalAmount` | number | yes | `SaleValue + TaxCharged + FurtherTax` |
| `InvoiceType` | number | yes | `1` New, `3` Credit, `11` Third Schedule New, `12` Third Schedule Credit, `139` Sale of goods under SRO 297(I)/2023 |
| `RefUSIN` | string | for credit | The original bill's `USIN` |

### 7.3 Worked example: a hospital OPD bill

```json
{
  "InvoiceNumber": "",
  "POSID": 110014,
  "USIN": "OPD-2026-000123",
  "RefUSIN": null,
  "DateTime": "2026-10-08 11:42:00",
  "BuyerName": "Test Patient",
  "BuyerNTN": "",
  "BuyerCNIC": "3520212345671",
  "BuyerPhoneNumber": "03001234567",
  "TotalSaleValue": 2500.00,
  "TotalTaxCharged": 0.00,
  "TotalQuantity": 1,
  "Discount": 0.00,
  "FurtherTax": 0.00,
  "TotalBillAmount": 2500.00,
  "PaymentMode": 1,
  "InvoiceType": 1,
  "Items": [
    {
      "ItemCode": "CONS-SPEC",
      "ItemName": "Specialist consultation",
      "PCTCode": "98151000",
      "Quantity": 1,
      "TaxRate": 0,
      "SaleValue": 2500.00,
      "Discount": 0.00,
      "TaxCharged": 0.00,
      "FurtherTax": 0.00,
      "TotalAmount": 2500.00,
      "InvoiceType": 1,
      "RefUSIN": null
    }
  ]
}
```

The spec's sample JSON uses curly quotes (`“ ”`), which are not valid JSON. Copy from here or from
`fbr-ims-test-scenarios.json`, not from the PDF.

---

## 8. Calculation rules

Per item, rounded to 2 decimals:

```
SaleValue   = (unitPrice × Quantity) − Discount
TaxCharged  = SaleValue × TaxRate / 100
TotalAmount = SaleValue + TaxCharged + FurtherTax
```

Header, summed from the item array you are about to send:

```
TotalSaleValue  = Σ SaleValue        TotalTaxCharged = Σ TaxCharged
TotalQuantity   = Σ Quantity         Discount        = Σ Discount
FurtherTax      = Σ FurtherTax       TotalBillAmount = Σ TotalAmount
```

The spec's own figures follow this (1,298 sale value + 221 tax = 1,519 bill, with a 380 discount
reported separately). Its .NET item sample does not add up (SaleValue 3180, TotalAmount 3000), so
don't use that sample as a calculation reference.

Compute the header **from the mapped item array**, never from screen totals, which may round
differently. The tester's **Recompute totals** button does exactly this.

---

## 9. Handling the response

### 9.1 Success

```json
{
  "InvoiceNumber": "9000052011142444901",
  "Code": "100",
  "Response": "Fiscal Invoice Number generated successfully.",
  "Errors": null
}
```

Some responses name the field `FBRInvoiceNumber` instead of `InvoiceNumber`. Read either.

### 9.2 The checks you must implement

Treat the bill as fiscalized only when **all three** hold:

1. HTTP status is 2xx, **and**
2. the body's `Code` is `"100"` (compare as a string; some replies send a number), **and**
3. `InvoiceNumber` (or `FBRInvoiceNumber`) is non-empty.

Anything else is a failure. Store `Code`, `Response` and `Errors` verbatim on the bill. Also handle
`5xx` (FBR side), timeouts, and HTML gateway pages that come back instead of JSON. Show the first
500 characters of the raw body so the cause is visible.

### 9.3 Gateway errors (401 / 403)

FBR's API gateway checks the token before IMS sees the bill. It replies with a `fault` object, not
IMS's `Code`, so read `fault.code`:

| HTTP | `fault.code` | Meaning | Fix |
|---|---|---|---|
| 401 | `900902` | No token sent | Send `Authorization: Bearer <token>` |
| 401 | `900901` | Token not recognised | Typo, expired, or revoked: copy it again or regenerate |
| 403 | `900908` | **Token is valid, but not for this API** | The token was issued for another FBR channel (DI or POS DI). Get the token for your **IMS** POS registration |
| 403 | `900910` | Token lacks the scope for this resource | Regenerate it for this API |

`900908` is the usual first-day error. Each token only opens the API **and environment** it was
issued for, and all channels share one gateway. Two common cases:

- a DI or POS DI token used against the IMS URL;
- a **production** IMS token used against the IMS **sandbox** URL. The production token is accepted
  only on `gw.fbr.gov.pk/imsp/...`; testing needs the token that goes with the **test POS ID**.

To find out which API a token belongs to without filing anything, use **Check token** in the IMS
Tester, or POST an empty body `{}` yourself. A
`900908` means "not this API"; an IMS reply such as `Code "102"` means the token opens it.

The spec does not publish a list of rejection codes. Log every non-100 code you see in the sandbox
and build your own table as you go. Codes observed so far:

| `Code` | `Response` | Meaning |
|---|---|---|
| `100` | Fiscal Invoice Number generated successfully / Invoice received successfully | Accepted |
| `102` | Invalid data received | Payload rejected. `InvoiceNumber` comes back as `"Not Available"`, so never treat a non-empty `InvoiceNumber` alone as success |

---

## 10. Posting flow inside your application

```
Cashier saves the bill
   └─ app commits it locally (status: NotFiscalized)
         └─ build IMS payload (right POSID for this counter, fresh USIN)
               └─ POST PostData  (or localhost:8524/…/GetInvoiceNumberByModel)
                     ├─ Code 100 + InvoiceNumber → store it, LOCK the bill, print receipt
                     └─ anything else           → store Code/Response/Errors, bill stays editable
```

Non-negotiables:

- **There is no validate endpoint.** Every call creates a record. Rehearse in the sandbox only.
- **Call FBR outside your database transaction.** Commit the bill first, then call FBR. A timeout
  must never roll back a real bill.
- **Never auto-retry a timeout.** FBR may have accepted it. Mark the bill "unknown" and resolve it by
  hand. A blind retry files the bill twice, and only a Credit bill can undo it.
- **One USIN, one bill, forever.** Generate it once when the bill is saved. Resending a bill means
  reusing its USIN, never inventing a new one.
- **Lock a bill once it has a Fiscal Invoice Number.** No edits, no deletes, no date changes.
  Corrections go through a Credit (`InvoiceType 3`) and a new bill.
- **Map each counter to its own POSID.** One hard-coded POSID for the whole hospital files every
  counter's bills against one terminal.
- **Build a fiscalization register screen first:** a list of bills with their status and a manual
  Post button. Connections drop, and this screen is how the day gets reconciled.

---

## 11. Hospitals and clinics

This section covers medical billing under income-tax POS integration.

### 11.1 Which tax, which authority

- **Punjab sales tax on services** for hospitals is set by the **Punjab Sales Tax on Services Act
  2012, Second Schedule, serial 68** (as amended by the Finance Act 2021-22). It taxes (i) medical
  consultation/visit fees **exceeding Rs 1,500** per consultation/visit and (ii) hospital bed/room
  charges **exceeding Rs 6,000 per day** per bed/room at **0% without input tax adjustment**, under
  heading **9815.1000** and other respective headings.
- That tax is administered by the **Punjab Revenue Authority (PRA)**, not FBR. Ask your tax advisor
  whether PRA's own integration also applies.
- **FBR integration** for hospitals, clinics and labs comes from **income tax** (SRO 779(I)/2020,
  SRO 428(I)/2024). Register the POS for **Income Tax** (§4.1) and fiscalize **every** bill,
  whatever its tax rate.

### 11.2 Mapping a hospital bill

| Bill line | `PCTCode` | `TaxRate` | `Quantity` | Notes |
|---|---|---|---|---|
| OPD consultation > Rs 1,500 | `98151000` | `0` | visits | Serial 68(i) |
| Consultation ≤ Rs 1,500 | `98151000` | `0` | visits | Outside serial 68. Confirm treatment with your advisor; still fiscalize it |
| Room / bed > Rs 6,000/day | `98151000` | `0` | days | Serial 68(ii). One line per room type, quantity = days |
| Room / bed ≤ Rs 6,000/day | `98151000` | `0` | days | Outside serial 68. Confirm treatment |
| Consultant visits during admission | `98151000` | `0` | visits | |
| Lab, radiology, procedures, pharmacy | per advisor | per advisor | | "Other respective headings". Get each heading and rate confirmed before go-live |

Put each rate and heading on the **service master** as data, not in code, so an advisor's correction
is a settings change.

### 11.3 Hospital-specific rules

- **Advance deposits are not bills.** Fiscalize the final bill (OPD receipt or IPD discharge bill),
  not each deposit.
- **Refunds** on cancelled visits or overpaid deposits go as `InvoiceType 3` with `RefUSIN` pointing
  at the original bill.
- **Panel/corporate patients:** put the company's NTN in `BuyerNTN` and use the real `PaymentMode`
  (often `6` Cheque or `5` Mixed).
- **Patient privacy:** `BuyerName`, `BuyerCNIC` and phone are optional. Send them only when your
  advisor says you must. Never put a diagnosis in `ItemName`; use "Specialist consultation", not the
  condition.

---

## 12. Sandbox → production

1. Register the POS and generate the **test POS ID** (§4.5). For cloud, use the shared sandbox token
   (§4.6); for local, install the component in **Test** mode with the test POS ID and its Code.
2. Open `fbr-test-harness.html` → **IMS Tester**. Enter the token and test POSID, then run the
   scenarios in `fbr-ims-test-scenarios.json` (IMS-H01 … IMS-H06 for hospitals, IMS-R01/R02 for
   retail). Each must return `Code 100` and an invoice number.
3. Repeat the same cases **from your own application**. The tester proves FBR accepts a payload; only
   your app proves your mapping produces it from a real bill.
4. Print a test receipt and check the QR code scans on the real printer.
5. Switch to the **production** POS ID and token (cloud), or reinstall the component in Production
   mode (§5).
6. Post **one real low-value bill**, verify it in FBR's verification app or IRIS, then roll out
   counter by counter.

---

## 13. Printing and display (mandatory)

Every receipt must carry:

- the **Fiscal Invoice Number** returned by FBR,
- a **QR code** encoding that number: QR version 2 (25×25 modules), printed **0.70 × 0.70 to
  1.0 × 1.0 inch**,
- the **FBR POS logo** image from the spec.

Generate the QR locally from the stored number, and print the FBR block **only** when a number exists,
so an unfiscalized bill never carries an FBR mark.

Each outlet must also **display a sign board** with FBR's official logo and the text **"Integrated
with FBR"**, plus the **registration number of each POS**.

---

## 14. Data your app must store

**Per company:** NTN, business name; cloud sandbox URL + token; production URL + token (encrypted);
mode (cloud/local); environment switch.
**Per counter:** test POS ID, production POS ID, and for local mode the PC it is installed on.
**Per bill:** USIN, RefUSIN, Fiscal Invoice Number, sent timestamp, `Code`/`Response`/`Errors`, and the
exact JSON sent.
**Per service/product:** PCT code, tax rate, item invoice type (1 / 11 / 139).

**FBR support:** helpline@fbr.gov.pk · (051) 111-772-772.

---

## 15. Go-live checklist

- [ ] POS registered for the right tax (Income Tax for hospitals/clinics), branches and counters complete
- [ ] Test POS ID and production POS ID recorded per physical counter
- [ ] Token stored server-side, encrypted; certificate validation **on**
- [ ] `USIN` generated once per bill, unique per POS, never reused
- [ ] Header totals computed from the mapped item array
- [ ] `PCTCode` sent as 8 digits without a dot; `BuyerCNIC` 13 digits without dashes
- [ ] `PaymentMode` 1–6 and `InvoiceType` 1–3 (not the spec's 21–29 numbering)
- [ ] Success requires HTTP 2xx **and** `Code == "100"` **and** a non-empty invoice number
- [ ] FBR call outside the DB transaction; timeouts never auto-retried
- [ ] Fiscalized bills locked; refunds go as `InvoiceType 3` + `RefUSIN`
- [ ] Fiscalization register screen with manual Post per bill
- [ ] Receipt prints the number, a scannable QR (0.7–1.0 inch) and the FBR logo
- [ ] "Integrated with FBR" sign board and POS registration numbers displayed at each outlet
- [ ] Every sandbox scenario that matches your business passes, from the app and not only the tester
- [ ] Production POS ID + token set, one real bill verified
