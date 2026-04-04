// my-forms.js — Phase 2 bank form intake
// bleeding.cash / MCFL Restaurant Holdings LLC

const API = 'https://gsb-swarm-production.up.railway.app';

// ── Token gate ──────────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const urlToken = params.get('token');
if (urlToken) document.getElementById('tokenInput').value = urlToken.toUpperCase();

document.getElementById('gateBtn').addEventListener('click', verifyToken);
document.getElementById('tokenInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') verifyToken();
});

async function verifyToken() {
  const token = document.getElementById('tokenInput').value.trim().toUpperCase();
  if (!token) return;
  const btn = document.getElementById('gateBtn');
  btn.textContent = 'Verifying...';
  btn.disabled = true;

  try {
    // Verify token exists via download endpoint (lightweight check)
    const res = await fetch(`${API}/api/financial-triage/download/${token}`, { method: 'HEAD' });
    if (res.ok || res.status === 200 || res.status === 206) {
      showMainContent(token);
    } else {
      // Token not found but allow TEST tokens through
      if (token.startsWith('TEST-') || token.startsWith('TKN-')) {
        showMainContent(token);
      } else {
        showGateError('Token not found. Check your email and try again.');
        btn.textContent = 'Access My Forms';
        btn.disabled = false;
      }
    }
  } catch (e) {
    // Network error — allow through for testing
    showMainContent(token);
  }
}

function showGateError(msg) {
  const el = document.getElementById('gateError');
  el.textContent = msg;
  el.style.display = 'block';
}

function showMainContent(token) {
  document.getElementById('gate').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  document.getElementById('tokenDisplay').textContent = token;
  window._accessToken = token;
  setTimeout(() => initSignaturePad(), 200);
}

// ── Signature pad ──────────────────────────────────────────────────────────
let sigPad = null;

function initSignaturePad() {
  const canvas = document.getElementById('signaturePad');
  if (!canvas || !window.SignaturePad) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width || 700;
  canvas.height = 140;
  sigPad = new SignaturePad(canvas, {
    penColor: '#0D1B2A',
    backgroundColor: 'rgba(255,255,255,0)',
    minWidth: 1.5,
    maxWidth: 3,
  });
  sigPad.addEventListener('endStroke', () => {
    document.getElementById('sig-status').textContent = '✓ Signature captured';
    document.getElementById('sig-status').style.color = '#27ae60';
  });
}

document.getElementById('sigClearBtn')?.addEventListener('click', () => {
  if (sigPad) sigPad.clear();
  document.getElementById('sig-status').textContent = '';
});
document.getElementById('sigTypeToggle')?.addEventListener('click', () => {
  document.getElementById('sig-draw-area').classList.add('hidden');
  document.getElementById('sig-type-area').classList.remove('hidden');
  document.getElementById('typedSignature')?.focus();
});
document.getElementById('sigDrawToggle')?.addEventListener('click', () => {
  document.getElementById('sig-type-area').classList.add('hidden');
  document.getElementById('sig-draw-area').classList.remove('hidden');
  if (!sigPad) initSignaturePad();
});
document.getElementById('typedSignature')?.addEventListener('input', e => {
  const v = e.target.value.trim();
  const el = document.getElementById('sig-status');
  el.textContent = v ? `✓ Typed: "${v}"` : '';
  el.style.color = '#27ae60';
});

function getSignatureData() {
  const typed = document.getElementById('typedSignature')?.value?.trim();
  const typeArea = document.getElementById('sig-type-area');
  if (typeArea && !typeArea.classList.contains('hidden') && typed) {
    return `typed:${typed}`;
  }
  if (sigPad && !sigPad.isEmpty()) return sigPad.toDataURL('image/png');
  return null;
}

// ── Debt rows ──────────────────────────────────────────────────────────────
function addDebtRow() {
  const container = document.getElementById('debtRows');
  const row = document.createElement('div');
  row.className = 'debt-row';
  row.innerHTML = `
    <input type="text" placeholder="Lender name">
    <input type="number" placeholder="Balance" min="0">
    <input type="number" placeholder="Payment" min="0">
    <input type="text" placeholder="Collateral / type">
    <button type="button" class="remove-row" onclick="removeDebtRow(this)">&times;</button>
  `;
  container.appendChild(row);
  // Show remove buttons on all rows when >1
  container.querySelectorAll('.remove-row').forEach(b => b.style.display = 'inline');
}

function removeDebtRow(btn) {
  const row = btn.closest('.debt-row');
  row.remove();
  const rows = document.querySelectorAll('#debtRows .debt-row');
  if (rows.length === 1) rows[0].querySelector('.remove-row').style.display = 'none';
}

// ── Form submission ────────────────────────────────────────────────────────
document.getElementById('intakeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('generateBtn');
  btn.textContent = 'Generating your forms...';
  btn.disabled = true;

  try {
    // Build financial_data from form fields
    const fd = new FormData(e.target);
    const personalInfo = {};

    // Personal info
    const textFields = ['full_name','signer2_name','home_address','city_state_zip',
      'home_phone','business_phone','business_name','business_address',
      'business_type','other_income_description'];
    textFields.forEach(k => { const v = fd.get(k); if (v) personalInfo[k] = v; });
    personalInfo.married = fd.get('married') === 'true';

    // Numeric fields → assets / liabilities / income
    const numericFields = {
      assets: ['cash_on_hand','savings_accounts','ira_retirement','stocks_bonds',
                'real_estate_value','automobiles','life_insurance_csv','other_assets'],
      liabilities: ['accounts_payable','installment_auto','installment_auto_payment',
                    'installment_other','installment_other_payment','mortgages',
                    'unpaid_taxes','other_liabilities'],
      income: ['salary','real_estate_income','net_investment_income','other_income'],
    };
    const assets = {}, liabilities = {}, income = {};
    numericFields.assets.forEach(k => { const v = fd.get(k); if (v) assets[k] = parseFloat(v); });
    numericFields.liabilities.forEach(k => { const v = fd.get(k); if (v) liabilities[k] = parseFloat(v); });
    numericFields.income.forEach(k => { const v = fd.get(k); if (v) income[k] = parseFloat(v); });
    if (fd.get('other_income_description')) income.other_income_description = fd.get('other_income_description');

    // Debt rows
    const debtRows = document.querySelectorAll('#debtRows .debt-row');
    const notes_payable_list = [];
    debtRows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      const noteholder = inputs[0].value.trim();
      const current_balance = parseFloat(inputs[1].value) || 0;
      const payment = parseFloat(inputs[2].value) || 0;
      const collateral = inputs[3].value.trim();
      if (noteholder || current_balance > 0) {
        notes_payable_list.push({ noteholder, current_balance, payment, collateral, frequency: 'MONTHLY' });
      }
    });

    // Selected forms
    const selectedForms = ['sba413'];
    document.querySelectorAll('input[name="forms"]:checked').forEach(cb => selectedForms.push(cb.value));

    // Signature
    const signatureData = getSignatureData();

    // Build payload
    const payload = {
      accessToken: window._accessToken,
      personalInfo: JSON.stringify({
        personal_info: personalInfo,
        assets,
        liabilities,
        income,
        notes_payable_list,
        real_estate_list: [],
        stocks_list: [],
      }),
      selectedForms: selectedForms.join(','),
      signerName: personalInfo.full_name || '',
    };
    if (signatureData) payload.signatureData = signatureData;

    const res = await fetch(`${API}/api/generate-forms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Form generation failed');

    // Show success
    document.getElementById('intakeForm').style.display = 'none';
    document.getElementById('successState').style.display = 'block';
    document.getElementById('formsGenerated').textContent =
      (data.forms || selectedForms).join(' · ');

    // Update progress
    document.querySelectorAll('.progress-step').forEach((s, i) => {
      s.classList.remove('active');
      if (i <= 2) s.classList.add('done');
    });

  } catch (err) {
    btn.textContent = 'Generate My Bank Forms →';
    btn.disabled = false;
    alert('Error: ' + err.message + '\n\nEmail support@bleeding.cash if this keeps happening.');
  }
});
