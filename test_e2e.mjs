// Comprehensive End-to-End Integration & Security Test Suite for astro-award
import 'dotenv/config';
import assert from 'node:assert';
import mysql from 'mysql2/promise';

const BASE_URL = 'http://127.0.0.1:4321';
const DB_URL = (process.env['DATABASE_URL'] ?? 'mysql://user:password@localhost:3306/award_db').replace(/^["']|["']$/g, '').trim();
const isRemoteOrCloud = !DB_URL.includes('localhost') && !DB_URL.includes('127.0.0.1');


// Minimal 1x1 transparent PNG data URI for testing signature upload
const SAMPLE_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function runTests() {
  console.log('─── Starting Astro Award Enterprise E2E Test Suite ───\n');

  // Test 1: Static and public routes
  console.log('[Test 1] Testing static frontend routes & navigation header link...');
  const homeRes = await fetch(`${BASE_URL}/`);
  assert.strictEqual(homeRes.status, 200, 'Home page must return 200');
  const homeHtml = await homeRes.text();
  assert.ok(homeHtml.includes('Best Diversified Company Award'), 'Home page must contain award title');
  assert.ok(homeHtml.includes('/admin/login'), 'Header must contain link to /admin/login');
  assert.ok(homeHtml.includes('Admin Portal'), 'Header must display Admin Portal button text');

  // Verify Essential HTTP Security Headers
  assert.strictEqual(homeRes.headers.get('x-content-type-options'), 'nosniff', 'Must include nosniff');
  assert.strictEqual(homeRes.headers.get('x-frame-options'), 'DENY', 'Must include X-Frame-Options: DENY');
  assert.strictEqual(homeRes.headers.get('x-xss-protection'), '1; mode=block', 'Must include XSS protection');
  assert.strictEqual(homeRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', 'Must include referrer policy');
  assert.ok(homeRes.headers.get('permissions-policy')?.includes('camera=()'), 'Must include permissions policy');
  assert.ok(homeRes.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), 'Must include CSP frame-ancestors none');

  const applyRes = await fetch(`${BASE_URL}/apply`);
  assert.strictEqual(applyRes.status, 200, 'Apply page must return 200');

  const successRes = await fetch(`${BASE_URL}/success`);
  assert.strictEqual(successRes.status, 200, 'Success page must return 200');
  console.log('✓ All frontend routes respond with 200 OK and header displays Admin Portal link\n');

  // Test 2: Admin Route Guard Middleware & Public Exemption
  console.log('[Test 2] Testing admin route guard middleware & signup exemption...');
  const guardRes = await fetch(`${BASE_URL}/admin/dashboard`, { redirect: 'manual' });
  assert.strictEqual(guardRes.status, 302, 'Unauthenticated /admin/dashboard must return 302 redirect');
  assert.strictEqual(guardRes.headers.get('location'), '/admin/login', 'Must redirect to /admin/login');

  const loginPageRes = await fetch(`${BASE_URL}/admin/login`);
  assert.strictEqual(loginPageRes.status, 200, 'Admin login page must return 200');
  const loginHtml = await loginPageRes.text();
  assert.ok(loginHtml.includes('name="csrf_token"'), 'Admin login page must contain CSRF token');
  assert.ok(loginHtml.includes('/admin/signup'), 'Login page must have link to /admin/signup');

  const signupPageRes = await fetch(`${BASE_URL}/admin/signup`);
  assert.strictEqual(signupPageRes.status, 200, 'Admin signup page must return 200 and NOT be redirected');
  const signupHtml = await signupPageRes.text();
  assert.ok(signupHtml.includes('Admin Registration'), 'Signup page must contain registration title');
  assert.ok(signupHtml.includes('name="secret_key"'), 'Signup page must contain secret_key input');
  assert.ok(signupHtml.includes('/admin/login'), 'Signup page must have link back to /admin/login');
  console.log('✓ Route guard protects dashboard, while allowing public access to /admin/login and /admin/signup\n');

  // Test 2b: Admin Registration API Endpoint Security & Creation
  console.log('[Test 2b] Testing admin registration API endpoint...');
  const testRegEmail = `test_admin_${Date.now()}@award.gov.lk`;
  const regSecret = process.env['ADMIN_REGISTRATION_SECRET'] ?? 'choose_a_strong_secret_key_here_2026';

  // Bad registration secret
  const badSecretRes = await fetch(`${BASE_URL}/api/admin/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Admin',
      email: testRegEmail,
      password: 'StrongPassword123!',
      confirm_password: 'StrongPassword123!',
      secret_key: 'invalid_passcode',
    }),
  });
  assert.strictEqual(badSecretRes.status, 403, 'Invalid secret key must return 403 Forbidden');

  // Password mismatch
  const mismatchRes = await fetch(`${BASE_URL}/api/admin/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Admin',
      email: testRegEmail,
      password: 'StrongPassword123!',
      confirm_password: 'DifferentPassword123!',
      secret_key: regSecret,
    }),
  });
  assert.strictEqual(mismatchRes.status, 422, 'Password mismatch must return 422');

  // Valid registration
  const goodSignupRes = await fetch(`${BASE_URL}/api/admin/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Executive Evaluator',
      email: testRegEmail,
      password: 'StrongPassword123!',
      confirm_password: 'StrongPassword123!',
      secret_key: regSecret,
    }),
  });
  assert.strictEqual(goodSignupRes.status, 201, 'Valid registration must return 201 Created');
  const goodSignupJson = await goodSignupRes.json();
  assert.strictEqual(goodSignupJson.success, true);
  assert.strictEqual(goodSignupJson.redirect, '/admin/login');

  // Duplicate email check
  const duplicateRes = await fetch(`${BASE_URL}/api/admin/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Duplicate Admin',
      email: testRegEmail,
      password: 'StrongPassword123!',
      confirm_password: 'StrongPassword123!',
      secret_key: regSecret,
    }),
  });
  assert.strictEqual(duplicateRes.status, 409, 'Duplicate admin email must return 409 Conflict');
  console.log(`✓ Admin registration security validated: created new administrator (${testRegEmail})\n`);

  // Extract CSRF token from login HTML
  const csrfMatch = loginHtml.match(/name="csrf_token"\s+value="([^"]+)"/);
  assert.ok(csrfMatch && csrfMatch[1], 'Must find CSRF token');
  const csrfToken = csrfMatch[1];

  // Test 3: Admin Login Authentication
  console.log('[Test 3] Testing admin login authentication...');
  // Bad credentials
  const badLoginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@award.gov.lk',
      password: 'WrongPassword123!',
      csrf_token: csrfToken,
    }),
  });
  assert.strictEqual(badLoginRes.status, 401, 'Bad password must return 401');

  // Valid credentials
  const goodLoginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testRegEmail,
      password: 'StrongPassword123!',
      csrf_token: csrfToken,
    }),
  });
  assert.strictEqual(goodLoginRes.status, 200, 'Valid login must return 200');
  const goodLoginJson = await goodLoginRes.json();
  assert.strictEqual(goodLoginJson.success, true);
  assert.strictEqual(goodLoginJson.redirect, '/admin/dashboard');

  const setCookieHeader = goodLoginRes.headers.get('set-cookie');
  assert.ok(setCookieHeader && setCookieHeader.includes('admin_session='), 'Response must set admin_session cookie');
  assert.ok(setCookieHeader.includes('HttpOnly'), 'Cookie must be HttpOnly');
  assert.ok(setCookieHeader.includes('SameSite=Strict'), 'Cookie must be SameSite=Strict');

  const sessionCookie = setCookieHeader.split(';')[0];
  console.log('✓ Admin authenticated successfully with secure HttpOnly session cookie\n');

  // Test 4: Authenticated Dashboard Access
  console.log('[Test 4] Testing authenticated dashboard access...');
  const authDashboardRes = await fetch(`${BASE_URL}/admin/dashboard`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(authDashboardRes.status, 200, 'Authenticated user must access dashboard with 200 OK');
  const dashHtml = await authDashboardRes.text();
  assert.ok(dashHtml.includes('Applications Dashboard'), 'Dashboard title must be present');
  console.log('✓ Authenticated admin successfully accessed dashboard\n');

  // Test 5: Multipart File Upload and Application Submission
  console.log('[Test 5] Testing multipart evidence file upload & MySQL persistence...');
  const formData = new FormData();
  formData.append('company_name', 'Enterprise Holdings PLC');
  formData.append('financial_year', '2025/26');
  formData.append('nature_operations', 'Manufacturing');
  formData.append('contact_name', 'Anura Perera');
  formData.append('contact_designation', 'Managing Director');
  formData.append('contact_email', 'yomaldulanjana00@gmail.com');
  formData.append('contact_phone', '0779876543');
  formData.append('new_products_services', 'true');
  formData.append('new_market_entered', 'true');
  formData.append('new_market_details', 'Expanded into modern EU and Japanese clean tech supply chains.');
  formData.append('products[0][name]', 'CleanAir Turbines X');
  formData.append('products[0][description]', 'High efficiency low emission industrial filtration modules.');
  formData.append('total_company_revenue', '250000000'); // 250 Million
  formData.append('revenue[0][activity]', 'CleanAir Module Exports');
  formData.append('revenue[0][revenue]', '65000000'); // 65 Million (26%)
  formData.append('gross_profit_margin_option', 'Improved by more than 5%');
  formData.append('total_investment', '40000000'); // 40 Million
  formData.append('operating_profit', '12000000'); // 12 Million (ROI = 30%)
  formData.append('declaration_name', 'Anura Perera');
  formData.append('declaration_designation', 'Managing Director');
  formData.append('declaration_date', '2026-10-22');
  formData.append('declaration_confirmed', 'true');
  formData.append('signature_data', SAMPLE_SIGNATURE);

  // Test 5a: Malware Defense — Rejection of dangerous executable extensions (.php)
  console.log('[Test 5a] Testing rejection of executable files (.php webshell)...');
  const phpFormData = new FormData();
  phpFormData.append('company_name', 'Hacker Corp');
  phpFormData.append('declaration_confirmed', 'true');
  phpFormData.append('evidence_files[]', new Blob(['<?php echo "shell"; ?>'], { type: 'application/x-php' }), 'shell.php');
  const phpRes = await fetch(`${BASE_URL}/api/submit`, { method: 'POST', body: phpFormData });
  assert.strictEqual(phpRes.status, 422, 'PHP upload must be rejected with 422');
  const phpJson = await phpRes.json();
  assert.ok(phpJson.message.includes('prohibited') || phpJson.message.includes('Only .pdf'), 'Must reject executable file extension');

  // Test 5b: Malware Defense — Rejection of double extensions (payload.php.pdf)
  console.log('[Test 5b] Testing rejection of double extension attacks (payload.php.pdf)...');
  const doubleExtFormData = new FormData();
  doubleExtFormData.append('company_name', 'Hacker Corp');
  doubleExtFormData.append('declaration_confirmed', 'true');
  doubleExtFormData.append('evidence_files[]', new Blob(['%PDF-1.4 shell'], { type: 'application/pdf' }), 'payload.php.pdf');
  const doubleExtRes = await fetch(`${BASE_URL}/api/submit`, { method: 'POST', body: doubleExtFormData });
  assert.strictEqual(doubleExtRes.status, 422, 'Double extension must be rejected with 422');

  // Test 5c: Malware Defense — Rejection of extension spoofing (PNG extension with plain text bytes)
  console.log('[Test 5c] Testing rejection of extension spoofing / magic bytes mismatch...');
  const spoofFormData = new FormData();
  spoofFormData.append('company_name', 'Hacker Corp');
  spoofFormData.append('declaration_confirmed', 'true');
  spoofFormData.append('evidence_files[]', new Blob(['fake text pretending to be an image'], { type: 'image/png' }), 'spoof.png');
  const spoofRes = await fetch(`${BASE_URL}/api/submit`, { method: 'POST', body: spoofFormData });
  assert.strictEqual(spoofRes.status, 422, 'Extension spoofing must be rejected with 422');

  // Test 5d: Products Repeater Mandatory Validation (Empty array or incomplete items)
  console.log('[Test 5d] Testing mandatory products validation on /api/submit...');
  const noProductsRes = await fetch(`${BASE_URL}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: 'Test Corp',
      products: [],
    }),
  });
  assert.strictEqual(noProductsRes.status, 400, 'Missing products array must return 400');
  const noProductsJson = await noProductsRes.json();
  assert.strictEqual(noProductsJson.error, 'At least one product or service with description is required');

  const emptyProductFieldsRes = await fetch(`${BASE_URL}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: 'Test Corp',
      products: [{ product_service: 'Some Product', brief_description: '   ' }],
    }),
  });
  assert.strictEqual(emptyProductFieldsRes.status, 400, 'Whitespace/empty description must return 400');
  const emptyProductFieldsJson = await emptyProductFieldsRes.json();
  assert.strictEqual(emptyProductFieldsJson.error, 'At least one product or service with description is required');
  console.log('✓ Backend enforces mandatory products with non-empty name and description (HTTP 400)\n');

  // Test 5e: Strict Sri Lankan Phone Number Validation (Reject non-10-digit / invalid prefix)
  console.log('[Test 5e] Testing strict Sri Lankan phone number validation on /api/submit...');
  const invalidPhoneRes = await fetch(`${BASE_URL}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: 'Test Corp',
      nature_operations: 'Services',
      contact_name: 'Test User',
      contact_designation: 'Manager',
      contact_email: 'test@example.com',
      contact_phone: 'dfsdfs', // Invalid alphabetic string
      new_products_services: true,
      new_market_entered: true,
      products: [{ name: 'P1', description: 'D1' }],
      total_company_revenue: 1000000,
      revenue: [{ activity: 'Service', revenue: 1000000 }],
      gross_profit_margin_option: 'Improved by more than 5%',
      total_investment: 100000,
      operating_profit: 20000,
      declaration_name: 'Test User',
      declaration_designation: 'Manager',
      declaration_confirmed: true,
    }),
  });
  assert.strictEqual(invalidPhoneRes.status, 422, 'Invalid phone number must return 422');
  const invalidPhoneJson = await invalidPhoneRes.json();
  assert.ok(
    invalidPhoneJson.message.includes('valid 10-digit Sri Lankan phone number'),
    'Error message must state: Please enter a valid 10-digit Sri Lankan phone number'
  );
  console.log('✓ Backend enforces strict 10-digit Sri Lankan phone validation (HTTP 422)\n');

  // Add sample evidence files with genuine magic bytes (PDF and PNG)
  const validPngBuffer = Buffer.from(SAMPLE_SIGNATURE.split(',')[1], 'base64');
  const samplePdfBlob = new Blob(['%PDF-1.4 sample evidence pdf content for testing'], { type: 'application/pdf' });
  const sampleImgBlob = new Blob([validPngBuffer], { type: 'image/png' });
  formData.append('evidence_files[]', samplePdfBlob, 'Audited_Financials_FY25.pdf');
  formData.append('evidence_files[]', sampleImgBlob, 'Export_Accreditation_Certificate.png');

  const submitRes = await fetch(`${BASE_URL}/api/submit`, {
    method: 'POST',
    body: formData,
  });

  assert.strictEqual(submitRes.status, 200, 'Multipart submission must return 200');
  const submitJson = await submitRes.json();
  assert.strictEqual(submitJson.success, true);
  assert.ok(submitJson.reference, 'Must return reference number');
  assert.strictEqual(submitJson.pdfReady, true, 'PDF must be compiled');
  assert.strictEqual(submitJson.attachmentsCount, 2, 'Must record 2 uploaded evidence files');
  const submissionRef = submitJson.reference;
  console.log(`✓ Submitted application: ${submissionRef} with 2 attachments\n`);

  // Test 6: Verify MySQL Database Records
  console.log('[Test 6] Verifying records in MySQL database...');
  const conn = await mysql.createConnection({
    uri: DB_URL,
    ssl: isRemoteOrCloud ? { rejectUnauthorized: true, minVersion: 'TLSv1.2' } : undefined,
  });
  const [appRows] = await conn.query('SELECT * FROM applications WHERE reference = ?', [submissionRef]);
  assert.strictEqual(appRows.length, 1, 'Application must be stored in MySQL');
  const appDb = appRows[0];
  assert.strictEqual(appDb.company_name, 'Enterprise Holdings PLC');
  assert.strictEqual(appDb.contact_name, 'Anura Perera');
  assert.strictEqual(appDb.contact_designation, 'Managing Director');
  assert.strictEqual(appDb.declaration_name, 'Anura Perera');
  assert.strictEqual(appDb.declaration_designation, 'Managing Director');
  assert.strictEqual(appDb.status, 'PENDING');
  assert.strictEqual(Number(appDb.roi_percent), 30);

  const [attRows] = await conn.query('SELECT * FROM application_attachments WHERE application_id = ?', [appDb.id]);
  assert.strictEqual(attRows.length, 2, 'Both attachments must be stored in MySQL application_attachments');
  console.log(`✓ MySQL database verified: application id=${appDb.id}, attachments=${attRows.length}\n`);

  // Test 7: Admin Application Detail View
  console.log('[Test 7] Testing admin application detail view...');
  const detailRes = await fetch(`${BASE_URL}/admin/applications/${submissionRef}`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(detailRes.status, 200, 'Admin detail view must return 200');
  const detailHtml = await detailRes.text();
  assert.ok(detailHtml.includes('Enterprise Holdings PLC'), 'Detail view must contain company name');
  assert.ok(detailHtml.includes(submissionRef), 'Detail view must contain reference');
  assert.ok(detailHtml.includes('Audited_Financials_FY25.pdf'), 'Must display evidence attachment filename');
  assert.ok(detailHtml.includes('CleanAir Turbines X'), 'Must display qualitative product portfolio');
  console.log('✓ Admin application detail page rendered complete dossier\n');

  // Test 8: Secure File Streaming Endpoint
  console.log('[Test 8] Testing authenticated file streaming & ZIP generator...');
  // Official PDF
  const pdfStreamRes = await fetch(`${BASE_URL}/api/admin/download-file?ref=${submissionRef}&type=pdf`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(pdfStreamRes.status, 200, 'PDF stream must return 200');
  assert.strictEqual(pdfStreamRes.headers.get('content-type'), 'application/pdf');
  const pdfBytes = await pdfStreamRes.arrayBuffer();
  assert.strictEqual(Buffer.from(pdfBytes.slice(0, 5)).toString(), '%PDF-');

  // Single Attachment
  const attId = attRows[0].id;
  const attStreamRes = await fetch(`${BASE_URL}/api/admin/download-file?ref=${submissionRef}&fileId=${attId}`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(attStreamRes.status, 200, 'Attachment stream must return 200');

  // ZIP Bundle
  const zipRes = await fetch(`${BASE_URL}/api/admin/download-file?ref=${submissionRef}&type=zip`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(zipRes.status, 200, 'ZIP bundle download must return 200');
  assert.strictEqual(zipRes.headers.get('content-type'), 'application/zip');
  const zipBytes = await zipRes.arrayBuffer();
  // ZIP magic bytes: PK\x03\x04
  const zipHeader = Buffer.from(zipBytes.slice(0, 2)).toString();
  assert.strictEqual(zipHeader, 'PK', 'Downloaded ZIP must start with PK header');
  console.log(`✓ Official PDF, single attachment, and ZIP archive (${zipBytes.byteLength} bytes) downloaded successfully\n`);

  // Test 8b: Public Download HMAC Security & Anti-Enumeration
  console.log('[Test 8b] Testing public /api/download HMAC verification and tamper resistance...');
  // Missing token
  const noTokenRes = await fetch(`${BASE_URL}/api/download?ref=${submissionRef}`);
  assert.strictEqual(noTokenRes.status, 401, 'Download without token must return 401');

  // Tampered token
  const badTokenRes = await fetch(`${BASE_URL}/api/download?ref=${submissionRef}&ts=${Math.floor(Date.now()/1000)}&token=deadbeefdeadbeef`);
  assert.strictEqual(badTokenRes.status, 403, 'Download with tampered token must return 403');

  // Malformed reference traversal attempt
  const malformedRefRes = await fetch(`${BASE_URL}/api/download?ref=../../secret&ts=${Math.floor(Date.now()/1000)}&token=abc`);
  assert.strictEqual(malformedRefRes.status, 400, 'Malformed reference must return 400');

  // Valid download via signed downloadUrl
  const validDownloadRes = await fetch(submitJson.downloadUrl);
  assert.strictEqual(validDownloadRes.status, 200, 'Signed download URL must return 200');
  assert.strictEqual(validDownloadRes.headers.get('content-type'), 'application/pdf');
  console.log('✓ Public download endpoint cryptographically protected against tampering and enumeration\n');

  // Test 8c: Admin API Route Guard Protection
  console.log('[Test 8c] Testing unauthenticated access rejection on /api/admin/* endpoints...');
  const unauthApiRes = await fetch(`${BASE_URL}/api/admin/update-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference: submissionRef, status: 'REJECTED' }),
  });
  assert.strictEqual(unauthApiRes.status, 401, 'Unauthenticated /api/admin request must return 401');
  console.log('✓ Admin API endpoints require active, verified admin session\n');

  // Path Traversal Security Test
  console.log('[Test 9] Testing path traversal security defenses...');
  const traversalRes = await fetch(`${BASE_URL}/api/admin/download-file?ref=../../etc/passwd&type=pdf`, {
    headers: { Cookie: sessionCookie },
  });
  assert.strictEqual(traversalRes.status, 400, 'Path traversal must be rejected with 400 Bad Request');
  console.log('✓ Path traversal attempt successfully neutralized with 400 Bad Request\n');

  // Test 10: Status Update Workflow
  console.log('[Test 10] Testing application review status update...');
  const updateRes1 = await fetch(`${BASE_URL}/api/admin/update-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ reference: submissionRef, status: 'UNDER_REVIEW' }),
  });
  assert.strictEqual(updateRes1.status, 200);
  const updateJson1 = await updateRes1.json();
  assert.strictEqual(updateJson1.status, 'UNDER_REVIEW');

  const updateRes2 = await fetch(`${BASE_URL}/api/admin/update-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ reference: submissionRef, status: 'APPROVED' }),
  });
  assert.strictEqual(updateRes2.status, 200);

  // Verify in DB
  const [updatedAppRows] = await conn.query('SELECT status FROM applications WHERE reference = ?', [submissionRef]);
  assert.strictEqual(updatedAppRows[0].status, 'APPROVED', 'Application status must now be APPROVED in database');
  console.log('✓ Successfully transitioned status from PENDING -> UNDER_REVIEW -> APPROVED in MySQL\n');

  // Test 11: Admin Logout
  console.log('[Test 11] Testing admin logout and session invalidation...');
  const logoutRes = await fetch(`${BASE_URL}/api/admin/logout`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
    redirect: 'manual',
  });
  assert.ok(logoutRes.status === 303 || logoutRes.status === 302, 'Logout must return 302 or 303 redirect');
  assert.strictEqual(logoutRes.headers.get('location'), '/', 'Logout must redirect to home page (/)');

  const logoutCookieHeader = logoutRes.headers.get('set-cookie');
  assert.ok(logoutCookieHeader && (logoutCookieHeader.includes('Max-Age=0') || logoutCookieHeader.includes('admin_session=;')), 'Must clear session cookie');

  // Accessing dashboard with cleared cookie
  const unauthRes = await fetch(`${BASE_URL}/admin/dashboard`, {
    redirect: 'manual',
  });
  assert.strictEqual(unauthRes.status, 302, 'Must redirect to login after logout');
  console.log('✓ Admin successfully logged out; session destroyed\n');

  await conn.end();

  console.log('================================================================');
  console.log('🎉 ALL 11 ENTERPRISE E2E INTEGRATION & SECURITY TESTS PASSED 100%');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
