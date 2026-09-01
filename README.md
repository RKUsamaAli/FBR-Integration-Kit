# FBR Integration Pack — for the developer

Everything needed to integrate Pakistan's FBR e-invoicing into an application, from registration to a
verified production go-live. Self-contained: nothing here depends on any particular codebase.

**If you only take one file, take `fbr-test-harness.html`.** It carries both guides, the scenario
reference, the relay source and a working tester in a single offline page — open it in a browser, no
install, no network.

## Files

| File | What it is |
|---|---|
| `fbr-test-harness.html` | **The whole kit as one offline page.** Both guides to read, and a live tester: paste a token, load a scenario, post or validate, get a PASS/FAIL table and a CSV. Covers DI and POS. |
| `fbr-digital-invoice-developer-guide.md` | **Digital Invoicing (DI)** — the full guide. Registration, sandbox token, payload, calculations, response handling, error codes, go-live. |
| `fbr-pos-digital-invoice-developer-guide.md` | **POS Digital Invoicing** — the full guide. Terminal registration, BPOS ID, payload, code lists, response handling, go-live. |
| `fbr-di-sandbox-scenarios.md` | The 28 DI test scenarios (SN001–SN028) explained, grouped by what each one exercises, plus the failure table. |
| `fbr-di-sandbox-scenarios.json` | The same 28 scenarios as ready-to-post request bodies. |
| `fbr-proxy.js` | ~60-line Node relay. Required, because a browser cannot call FBR directly (no CORS headers). Also embedded in the HTML page, with a download button. |
| `harness.template.html`, `build-harness.js` | How the single page is produced. Edit the markdown, then run `node build-harness.js` to regenerate `fbr-test-harness.html`. Nothing to install. |

## Which one does this business need?

| | **Digital Invoicing (DI)** | **POS Digital Invoicing** |
|---|---|---|
| Purpose | Legal sales-tax invoice register | Retail till/receipt reporting (SRO 1006) |
| Typical user | Manufacturer, importer, distributor, wholesaler, corporate seller | Tier-1 retailer, restaurant, outlet counter |
| Registers | The **invoice** | The **terminal** (a BPOS ID per till) |
| Endpoint | `gw.fbr.gov.pk/di_data/v1/di/...` | `gw.fbr.gov.pk/pdi/v1/api/DigitalInvoicing/...` |
| Field style | Descriptive strings — `"18%"`, `"Numbers, pieces, units"` | Numeric codes — `18`, `uoM: 5` |
| Success signal | `validationResponse.statusCode == "00"` (string) → `invoiceNumber` | body `statusCode == 200` (number) → `result` tracking number |
| Per-item validation | Yes | No — one verdict per invoice |
| Dry-run endpoint | **Yes** — `validateinvoicedata` | **None. Every call writes.** |
| Onboarding gate | Pass the FBR-assigned SN scenarios in sandbox | Register + activate the terminal |

Some businesses must run **both** (a manufacturer with a retail outlet). Then keep two independent
settings blocks, two tokens, and pick exactly one channel per sale — never post the same sale to both.

## Order of work

1. **Read the guide** for the channel you need — DI or POS. Open `fbr-test-harness.html` and use the
   **DI Guide** / **POS Guide** tabs, or read the markdown files directly.
2. **Get the sandbox token** (guide §4). This is IRIS/portal work, not code, and it takes days.
   Start it before writing anything.
3. **Import FBR's lookup lists** (HS code, UoM, sale type, rate, SRO, province) and put them on your
   product and customer masters as dropdowns. Skipping this is the single largest source of
   production rejections.
4. **Prove the payload with the harness** before wiring it into the app:
   ```bash
   node fbr-proxy.js            # leave running (source + download button on the Overview tab)
   open fbr-test-harness.html   # or just double-click it
   ```
   Go to the **DI Tester** tab, paste the sandbox token, set the seller identity, and run
   **Validate All** first — it writes nothing.
5. **Wire it into the application**, then repeat the scenarios *from the app*. The harness proves FBR
   accepts a payload; only the app proves your mapping produces that payload from a real sale.
6. **Complete the assigned scenarios**, generate the production token, switch the environment, post
   one real low-value document, and verify it in IRIS.

## Five things that will bite, whichever channel you build

1. **HTTP 200 does not mean accepted.** Both APIs return 200 with a rejection in the body. DI also
   returns a `"00"` header with a failing item underneath. Check the body, and check every item.
2. **Call FBR outside your database transaction.** Commit the sale first, then submit. A timeout must
   not roll back a real sale.
3. **Never auto-retry a timed-out submission.** FBR may have accepted it. A blind retry files a
   duplicate legal document that can only be undone with a debit/credit note.
4. **Lock a document once FBR accepts it** — no edit, no delete, no date change.
5. **Tokens are server-side secrets.** Five-year credentials for a taxpayer's identity. Never in a
   browser, a mobile binary, or git.

## Verifying you are done

Each guide ends with a go-live checklist. Treat it as the definition of done — a passing sandbox
scenario is not the same thing as a shippable integration.
