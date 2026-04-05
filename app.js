const API = 'https://gsb-swarm-production.up.railway.app';

// File drops
function setupDrop(dropId, inputId, nameId) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  const name = document.getElementById(nameId);
  if (!drop || !input) return;

  function setFile(file) {
    if (!file) return;
    // Use DataTransfer to set files on input
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    name.innerHTML = `<span style="color:#27ae60">&#10003; ${file.name}</span> <button type="button" class="file-clear-btn" title="Remove file">&times;</button>`;
    drop.classList.add('has-file');
    // Clear button
    name.querySelector('.file-clear-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      name.innerHTML = '';
      drop.classList.remove('has-file');
    });
  }

  drop.addEventListener('click', (e) => {
    if (e.target.classList.contains('file-clear-btn')) return;
    if (e.target.tagName === 'LABEL') return;
    input.click();
  });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => { if (input.files[0]) setFile(input.files[0]); });
  drop.querySelectorAll('label').forEach(l => l.addEventListener('click', e => e.stopPropagation()));
}
setupDrop('bankDrop', 'bankFile', 'bankName');
setupDrop('posDrop', 'posFile', 'posName');

// ── Payment return handler ─────────────────────────────────────────────────────────
// When Basalt redirects back after payment, URL will have ?receipt=R-XXXXXX
(async () => {
  const params = new URLSearchParams(window.location.search);
  const receiptId = params.get('receipt');
  if (!receiptId) return;

  // Restore saved form data
  const saved = JSON.parse(sessionStorage.getItem('bc_pending') || 'null');
  if (!saved) return;

  // Show payment confirming state
  showStep('step2');
  const btn = document.getElementById('submitBtn');
  if (btn) { btn.textContent = 'Confirming payment…'; btn.disabled = true; }

  // Poll for payment confirmation (max 60s)
  let uploadToken = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const r = await fetch(`${API}/api/check-payment?receiptId=${encodeURIComponent(receiptId)}`);
      const d = await r.json();
      if (d.paid) { uploadToken = d.uploadToken; break; }
    } catch (_) {}
  }

  if (!uploadToken) {
    alert('Payment confirmation timed out. Email support@bleeding.cash with your receipt: ' + receiptId);
    if (btn) { btn.textContent = 'Get My Reports →'; btn.disabled = false; }
    return;
  }

  // Run triage with confirmed token
  try {
    if (btn) btn.textContent = 'Analyzing your files…';
    const fd = new FormData();
    fd.append('projectName', saved.projectName);
    fd.append('period', saved.period);
    fd.append('email', saved.email);
    fd.append('uploadToken', uploadToken);
    fd.append('agreedToTos', 'true');
    fd.append('mode', 'restaurant');

    // Re-attach files if still available
    if (saved.bankFileData) {
      const blob = await fetch(saved.bankFileData).then(r => r.blob());
      fd.append('bankFile', blob, saved.bankFileName);
    }
    if (saved.posFileData) {
      const blob = await fetch(saved.posFileData).then(r => r.blob());
      fd.append('posFile', blob, saved.posFileName);
    }

    const res = await fetch(`${API}/api/financial-triage`, { method: 'POST', body: fd });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Server error'); }
    const data = await res.json();

    sessionStorage.removeItem('bc_pending');
    const token = data.accessToken || uploadToken;
    document.getElementById('accessToken').textContent = token;
    const fl = document.getElementById('formsLink');
    if (fl) fl.href = `/my-forms?token=${token}`;
    showStep('step3');
  } catch (err) {
    alert('Analysis error: ' + err.message + '\n\nYour payment was received. Email support@bleeding.cash and we will process manually.');
  }
})();

// ── Form submit ─────────────────────────────────────────────────────────
let _submitting = false;
document.getElementById('triageForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (_submitting) return;
  _submitting = true;

  const btn = document.getElementById('submitBtn');
  btn.textContent = 'Creating order…';
  btn.disabled = true;

  const projectName = document.getElementById('projectName').value.trim();
  const period = document.getElementById('period').value.trim();
  const email = document.getElementById('email').value.trim();
  const bankFile = document.getElementById('bankFile').files[0];

  if (!bankFile) {
    alert('Please upload your bank statement before submitting.');
    _submitting = false;
    btn.textContent = 'Get My Reports →';
    btn.disabled = false;
    return;
  }

  try {
    // Save files as data URLs so they survive the payment redirect
    const toDataURL = f => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    });

    const bankFileData = await toDataURL(bankFile);
    const posFile = document.getElementById('posFile')?.files[0];
    const posFileData = posFile ? await toDataURL(posFile) : null;

    // Save form data to sessionStorage before redirect
    sessionStorage.setItem('bc_pending', JSON.stringify({
      projectName, period, email,
      bankFileData, bankFileName: bankFile.name,
      posFileData, posFileName: posFile?.name || null,
    }));

    // Create Basalt payment order
    const orderRes = await fetch(`${API}/api/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, email, period })
    });
    const orderData = await orderRes.json();

    if (!orderData.paymentUrl) {
      throw new Error(orderData.error || 'Could not create payment order');
    }

    // Redirect to Basalt payment page
    const returnUrl = window.location.origin + window.location.pathname + '?receipt=' + orderData.receiptId;
    window.location.href = orderData.paymentUrl + '&returnUrl=' + encodeURIComponent(returnUrl);

  } catch (err) {
    _submitting = false;
    btn.textContent = 'Get My Reports →';
    btn.disabled = false;
    alert('Error: ' + err.message + '\n\nEmail support@bleeding.cash if this keeps happening.');
  }
});

// ── Signature Pad Setup ──────────────────────────────────────────────────
let sigPad = null;

function initSignaturePad() {
  const canvas = document.getElementById('signaturePad');
  if (!canvas || !window.SignaturePad) return;
  // Resize canvas to actual pixel size
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width || 480;
  canvas.height = 130;
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

document.getElementById('typedSignature')?.addEventListener('input', (e) => {
  if (e.target.value.trim()) {
    document.getElementById('sig-status').textContent = `✓ Typed signature: "${e.target.value.trim()}"`;
    document.getElementById('sig-status').style.color = '#27ae60';
  } else {
    document.getElementById('sig-status').textContent = '';
  }
});

function getSignatureData() {
  // Check typed signature first
  const typed = document.getElementById('typedSignature')?.value?.trim();
  const typeArea = document.getElementById('sig-type-area');
  if (typeArea && !typeArea.classList.contains('hidden') && typed) {
    // Render typed name to canvas for backend
    return { type: 'typed', name: typed };
  }
  // Check drawn signature
  if (sigPad && !sigPad.isEmpty()) {
    return { type: 'drawn', dataUrl: sigPad.toDataURL('image/png') };
  }
  return null;
}

function getSelectedForms() {
  const checks = document.querySelectorAll('#formSelector input[type=checkbox]:checked');
  return Array.from(checks).map(c => c.value).join(',');
}

// Init sig pad when step 2 becomes visible
const origShowStep = window.showStep;
function showStep(id) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
  if (id === 'step2') {
    setTimeout(() => initSignaturePad(), 100);
  }
}

// ── File upload submit ──────────────────────────────────────────────────
document.getElementById('uploadBtn').addEventListener('click', async () => {
  const bankFile = document.getElementById('bankFile').files[0];
  if (!bankFile) { alert('Please upload your bank statement first.'); return; }
  
  const btn = document.getElementById('uploadBtn');
  btn.textContent = 'Generating your reports…';
  btn.disabled = true;

  try {
    const fd = new FormData();
    fd.append('projectName', formData.projectName);
    fd.append('period', formData.period);
    fd.append('email', formData.email);
    fd.append('uploadToken', window._uploadToken);
    fd.append('agreedToTos', 'true');
    fd.append('mode', 'restaurant');
    fd.append('bankFile', bankFile);
    
    const posFile = document.getElementById('posFile').files[0];
    if (posFile) fd.append('posFile', posFile);

    // Add selected forms
    const selectedForms = getSelectedForms();
    if (selectedForms) fd.append('selectedForms', selectedForms);

    // Add signature data if provided
    const sigData = getSignatureData();
    if (sigData) {
      if (sigData.type === 'drawn') {
        fd.append('signatureData', sigData.dataUrl);
      } else if (sigData.type === 'typed') {
        // Send typed name — backend renders it as a signature image
        fd.append('signatureData', `typed:${sigData.name}`);
      }
      fd.append('signerName', formData.projectName || '');
    }

    const res = await fetch(`${API}/api/financial-triage`, {
      method: 'POST',
      body: fd
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server error ' + res.status);
    }
    
    const data = await res.json();
    
    // Show success
    document.getElementById('accessToken').textContent = data.accessToken || window._uploadToken;
    if (data.downloadUrl) {
      document.getElementById('downloadLink').href = data.downloadUrl;
      document.getElementById('downloadLink').style.display = 'inline-flex';
    }
    showStep('step3');
    
  } catch (err) {
    btn.textContent = 'Generate My Reports →';
    btn.disabled = false;
    alert('Error: ' + err.message + '\n\nEmail support@bleeding.cash if this keeps happening.');
  }
});

// Chat
const FAQ = [
  { q: /food cost/i, a: "Food cost % = COGS ÷ revenue. QSR benchmark: 28-32%. Above 35% = purchasing or waste problem." },
  { q: /labor/i, a: "Labor benchmark for QSR: 25-30% of revenue. Include all payroll, benefits, and taxes." },
  { q: /vendor|creditor/i, a: "The vendor letter explains your cash position honestly and proposes a realistic payment timeline." },
  { q: /bank|loan|refinanc/i, a: "The bank letter presents your financials the way lenders expect, making the strongest possible case for refinancing." },
  { q: /mca|merchant cash/i, a: "MCAs have effective APRs of 60-150%. Refinancing into a bank term loan should be a top priority if your numbers support it." },
  { q: /anonymous|privacy|data|delete/i, a: "Your files are anonymized immediately — business name replaced with your project code. Files deleted after analysis runs." },
  { q: /how long|when|time/i, a: "Reports generated within 10 minutes. Download link valid for 24 hours." },
  { q: /free|re.?run/i, a: "You get 3 free re-runs within 90 days." },
  { q: /price|cost|\$24/i, a: "The service is $24.95 flat for all 3 documents. No subscriptions, no hidden fees." },
];

function getChatResponse(msg) {
  for (const item of FAQ) { if (item.q.test(msg)) return item.a; }
  return "Good question. Email support@bleeding.cash for anything specific to your report — we respond within 1 business day.";
}

const bubble = document.getElementById('chatBubble');
const win = document.getElementById('chatWindow');
const closeBtn = document.getElementById('chatClose');
const msgs = document.getElementById('chatMessages');
const input = document.getElementById('chatInput');
const send = document.getElementById('chatSend');

bubble.addEventListener('click', () => { win.classList.toggle('hidden'); if (!win.classList.contains('hidden')) input.focus(); });
closeBtn.addEventListener('click', () => win.classList.add('hidden'));

function addMsg(text, role) {
  const d = document.createElement('div');
  d.className = 'chat-msg ' + role;
  d.textContent = text;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

function sendChat() {
  const msg = input.value.trim();
  if (!msg) return;
  addMsg(msg, 'user');
  input.value = '';
  const thinking = document.createElement('div');
  thinking.className = 'chat-msg agent';
  thinking.style.opacity = '0.5';
  thinking.textContent = 'Thinking…';
  msgs.appendChild(thinking);
  setTimeout(() => { thinking.remove(); addMsg(getChatResponse(msg), 'agent'); }, 600 + Math.random() * 400);
}

send.addEventListener('click', sendChat);
input.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

window.addEventListener('scroll', () => {
  const header = document.querySelector('.header');
  if (header) header.style.boxShadow = scrollY > 10 ? '0 2px 16px rgba(0,0,0,0.08)' : '';
}, { passive: true });
