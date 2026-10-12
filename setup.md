# Library Reeds — MAJORITY bookmark checkout add-on

These are modified *copies* of your existing saved HTML files (account edit-button-fixed from Oct 11, shop(3) from Oct 6, book_updated_offers from Oct 11). Originals remain untouched. Existing page structures were retained; one JavaScript module tag was appended to each page. `libraryreeds-bookmarks.js` must be deployed alongside all three.

## What is implemented
- Admin Digital Bookmarks section: PDF upload to private Firebase Storage, title/price/preview/payment URL, publish/hide, payment reference review, manual approval.
- `shop.html` and `book.html`: bookmark cards and MAJORITY payment link initiation through callable Cloud Function.
- `account.html`: signed-in customer order history and short-lived download link only after approved payment.
- Cloud Functions create orders and enforce server-side permission checks. Customers cannot mark their own order as paid.

## Deployment steps — required before the system will work
1. **Back up your current live pages.** Confirm whether your live HTML pages are newer than these saved copies before replacing them. Copy the updated HTML and `libraryreeds-bookmarks.js` to your site's same directory. The new module is independent of the preexisting Firebase scripts.
2. In Firebase Authentication, copy **your admin UID** (not email). Replace `REPLACE_WITH_FIREBASE_ADMIN_UID` in the two rule snippets and **merge** them into your current Firestore and Storage rules; do not replace whole rules files. The legacy admin check allowing emails containing `admin` in your existing page is not secure enough for digital payments; the new backend does not trust it.
3. From a configured Firebase CLI project (`firebase use libraryreeds-638f4`), deploy functions in `functions/` using your deployment setup. Set `LR_ADMIN_UID` as an environment variable for Cloud Functions (for example, in a `functions/.env` file **not** published on your website, value `LR_ADMIN_UID=YOUR_REAL_UID`). Firebase CLI supports environment configuration. Ensure your deployment uses `functions.source=functions`.
4. Deploy the merged Firestore and Storage rules. Firebase project may need a billing plan for Cloud Functions and signed download URL functionality; Cloud Functions runtime service account may need `iam.serviceAccounts.signBlob` permission to sign URLs.
5. Log in as the admin. In account.html, click **Digital Bookmarks & MAJORITY** in the sidebar; upload one PDF, preview image URL, amount, and genuine HTTPS MAJORITY link. Test a customer account through shop.html -> MAJORITY payment -> account.html -> submit reference -> admin independently verifies transaction/amount and approves -> customer downloads.
6. The added product list is separate from your existing books inventory. These bookmarks will not automatically alter preexisting books, inventory counts, coupons, cart, or order history. The example 2 x 6-inch size is descriptive; verify the actual uploaded PDF dimensions before publishing.

## Security and limitations
- MAJORITY payment request links/QR codes are **not** verified automatically. A payment reference typed by a customer **is not proof of payment**. Independently verify sender, amount, payment receipt and order match in the MAJORITY app before approving. If MAJORITY does not permit commercial payments on your account, don't deploy this checkout until clarified.
- If you use one generic payment link for multiple prices, customers might pay the wrong amount. Verify the actual amount before approval.
- The new downloadable PDF is stored under `lr_private_bookmarks/` with client read denied. Only a signed-in approved buyer can request a five-minute signed URL. Signed URLs are transferable until expiration: don't post or share them publicly.
- A PDF delivery method cannot prevent customers from sharing the file after purchase.
- The upload currently creates new bookmark listings; editing metadata (other than publish/hide) or removing listings is not yet part of this add-on.
- Your saved `account.html` contains what appears to be a hardcoded Telegram bot token. **Revoke/rotate that token and remove it from client-side HTML**; secrets in HTML are publicly exposed. I preserved the original content to honor the no-deletion request, but you should address this before deployment.
- This package is not deployed to your Firebase or live website. It has not been tested against your production project. Do not treat it as live until all steps above succeed.
