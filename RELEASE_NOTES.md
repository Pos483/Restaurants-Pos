# Siya Bill — Release Notes

## Version 2.3.1
### 🔑 Forgot Password, Email Confirmation Redirects & Accessibility Fixes
* **Desktop-to-Browser Password Reset**: Implemented web-based redirect handling for password resets. Since desktop setups run on local file systems (`file://`), clicking recovery emails now redirects users to the hosted Netlify web application (`https://siyabill.netlify.app/`) where they can securely update their passwords using a new premium interface.
* **Email Confirmation Dynamic Redirects**: Added dynamic redirection for new registrations, routing email confirmation clicks directly to the live Netlify application.
* **Premium Reset Password Screen**: Designed a state-of-the-art password change form complete with animated gradient backgrounds, glassmorphic inputs, responsive password verification, validation checks, and automatic post-update login redirects.
* **Automatic Redirection Logic**: Programmed auto-fallback to detect local testing server (`http://localhost:5173/`) or live server targets dynamically.
* **Remember Email Toggle Accessibility Fix**: Refactored the custom button switch into a native hidden checkbox inside a presentation container, resolving the pre-compilation strict ARIA validation check error.

---

## Version 2.0.4
### ✅ Stock Sync Race Condition Fix (Netlify Version)
* **Single-Phase Item Insertion**: Modified the stock item creation to add the item with the initial quantity directly. This removes the race condition where `db.stockItems.add(0)` and `db.stockItems.update(quantity)` would execute concurrently in the background and overwrite the correct quantity with 0 on Supabase.

---

## Version 2.0.3
### ✅ QR Code Scan — Final Fix (Canvas Raster Bitmap)
* **100% Printer Compatible**: QR code ab ESC/POS native commands (`GS ( k`) ki jagah **Canvas Raster Bitmap** se generate hota hai. Yeh method sab thermal printers par kaam karta hai — Epson, Chinese brands, 58mm, 80mm.
* **Sahi Size**: QR code ab ek fixed **280×280 pixels** size par print hota hai — kisi bhi phone se arm's length par aasani se scan hoga.
* **Error Correction Level H**: Highest error correction level use kiya gaya — thoda blur ya smudge hone par bhi QR scan hoga.
* **Amount Pre-filled**: GPay / PhonePe / Paytm / BHIM scan karte hi bill amount auto-fill ho jaata hai.
* **Bill Number in Note**: Payment app par "Bill No 000042" clearly dikhta hai.

---

## Version 2.0.2
### 🔍 UPI QR Code Fix (Scan Issue Resolved)
* **Amount Pre-filled on Scan**: QR code ab har bill ka sahi amount (`am` field) carry karta hai per NPCI specification, jo GPay / PhonePe / Paytm / BHIM sab par auto-fill hota hai.
* **Bill Number in Payment Note**: `tn` field ab clearly "Bill No 000042" dikhata hai scanner app ke confirmation screen par.
* **Transaction Reference**: `tr` field added (`BILL000042`) merchant reconciliation ke liye.
* **Correct URL Encoding**: `URLSearchParams` use kiya gaya hai manual encoding ki jagah — spaces ab `%20` encode hote hain jo NPCI-compliant hai.
* **Optimal QR Module Size**: ESC/POS module size 6→4 fix kiya gaya — 58mm aur 80mm dono paper par perfectly scannable.

---

## Version 2.0.1
### 🖨️ Cloud Auto-Print (Desktop Cloud Relay)
* **Mobile Printing Fallback**: Added a real-time background printing relay. Saving bills or KOT orders from mobile browsers (e.g. Netlify) triggers database updates to Supabase, which are caught instantly by the desktop PC's Electron app to automatically print the receipt or kitchen slips locally.

## Version 2.0.0
### ⚡ High Performance Cache Writing & Privacy Hardening
* **Instant Cache Checkout (Lag Resolution)**: Refactored database write methods (`add`, `put`, `update`, `delete`) to save changes instantly to local IndexedDB (Dexie) in under 10ms. Sync requests to Supabase are now triggered in non-blocking background tasks, completely resolving any UI freezes or lagging during active billing.
* **Partitioned POS Customer Directory**: Upgraded the local `pos_customers` table into a cloud-synchronized table backed by Row Level Security (RLS) on Supabase. Customers added to the promotional directory are now isolated by account user session (`app_user_id`), saving customer data securely to the cloud.
* **Clean Logout Data Purge**: Implemented complete local database clearing on account logout. Signing out of an account clears all local Dexie cache tables (`bills`, `menu_items`, `customers`, `pos_customers`, `expenses`, `active_orders` etc.) and resets sync timers, preventing any session or data leakage between multiple user profiles on the same hardware.

---

## Version 1.1.7
### 💬 WhatsApp Integration & Reminders
* **Dashboard Bill Resend**: Added a **Send WhatsApp** button to the Dashboard's View Bill modal. Resend receipts with a single click!
* **Khata Book Balance Reminders**: Added a **Reminder** button to the customer profile header in the Khata Book tab. Automatically sends polite outstanding balance summaries with UPI payment details if configured.
* **Anti-Spam Cooldown (20s)**: Clicking the resend or reminder buttons triggers a 20-second disabled cooldown showing a live countdown timer (`Wait 20s`...) to prevent duplicate messages.
* **Success/Failure Status Dialogs**: Custom-designed popup modals with bouncing green checkmarks (for success) or pulsing red warning signs (for failure) appear after each send, complete with an "OK" button to dismiss.
* **Conditional Visibility**: Resend buttons on Dashboard and Reminder buttons on Khata Book dynamically hide/show depending on whether valid customer phone details are present and outstanding balances exist.

### 🛠️ Accessibility & Lint Fixes
* **Accessible Form Control & Buttons**: Resolved accessible title and discernible text issues on modal close controls and repayment select elements.

---

## Version 1.1.6
### 🎨 Email Field Capitalization Bypass
* **Auto-Capitalization Skip**: Added bypass rules to the global first-letter-capitalize listener for email input fields, allowing natural lowercase typing on emails.

---
### 🎨 UI & Layout Improvements
* **Restaurant Name in Header**: Increased the header name width bounds. Longer restaurant names like **"KHANA KHAZANA FAMILY RESTAURANT"** now display fully without truncation or ellipsis (`...`).
* **Header Status Badge**: Simplified the green online badge to display only **"ONLINE"** (previously "ONLINE & SYNCED"), making it smaller, cleaner, and saving header space.
* **Interactive Premium Badge**: Made the **"Premium Active"** badge clickable. Clicking it now redirects you directly to the **Premium Subscription Tab**.

### 🛠️ Accessibility & Bug Fixes
* **Toast Close Accessibility**: Resolved lint warning by adding standard `title` and `aria-label` tags to the printer notification close button.

---

## Version 1.1.3
### ⚡ Performance & Startup Fixes
* **Startup Freeze Fix**: Refactored the internal WhatsApp browser zombie-checking system to run asynchronously. This prevents the Electron main thread from locking up for 10 seconds during app startup.
* **Fast Browser Path Lookup**: Optimized the system browser paths lookup to check static paths first. This avoids launching slow registry queries or command-line commands synchronously, decreasing startup delay to milliseconds.
* **White Screen Flash Prevention**: Configured the Electron window to load invisible (`show: false`) and display only after the page is fully ready to paint (`ready-to-show`), providing a smooth and professional app loading transition.

### 📐 Window Customization
* **Window Position & State Memory**: The app now remembers your window dimensions (width/height) and maximized state. It will open in the exact state you last closed it, rather than forcing a full screen window layout on every boot.
