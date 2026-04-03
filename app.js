const API = 'https://gsb-swarm-production.up.railway.app';

// File drops
function setupDrop(dropId, inputId, nameId) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  const name = document.getElementById(nameId);
  if (!drop || !input) return;
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) { input.files = e.dataTransfer.files; name.textContent = '✓ ' + e.dataTransfer.files[0].name; } });
  input.addEventListener('change', () => { if (input.files[0]) name.textContent = '✓ ' + input.files[0].name; });
  drop.querySelectorAll('label').forEach(l => l.addEventListener('click', e => e.stopPropagation()));
}
setupDrop('bankDrop', 'bankFile', 'bankName');
setupDrop('posDrop', 'posFile', 'posName');

// Form submit
let receiptId = null;
let pollInterval = null;

document.getElementById('triageForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.textContent = 'Creating order…';
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/api/create-triage-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: document.getElementById('projectName').value.trim(),
        period: document.getElementById('period').value.trim(),
        email: document.getElementById('email').value.trim(),
        mode: 'restaurant'
      })
    });
    const data = await res.json();
    if (!data.receiptId) throw new Error('No receipt ID returned');
    receiptId = data.receiptId;
    document.getElementById('paymentLink').href = data.paymentUrl || `https://surge.basalthq.com/basaltsurge/pay/${receiptId}`;
    showStep('step2');
  } catch (err) {
    btn.textContent = 'Pay $24.95 & Get My Reports →';
    btn.disabled = false;
    alert('Something went wrong. Please try again or email support@mcflamingo.com');
  }
});

document.getElementById('checkPayBtn').addEventListener('click', () => {
  const status = document.getElementById('payStatus');
  status.textContent = 'Checking payment…';
  let attempts = 0;
  pollInterval = setInterval(async () => {
    attempts++;
    if (attempts > 60) { clearInterval(pollInterval); status.textContent = 'Timed out. Email support@mcflamingo.com if you paid.'; return; }
    try {
      const res = await fetch(`${API}/api/check-payment?receiptId=${receiptId}`);
      const data = await res.json();
      if (data.paid) {
        clearInterval(pollInterval);
        document.getElementById('accessToken').textContent = data.uploadToken || 'TOKEN-' + Math.random().toString(36).slice(2,10).toUpperCase();
        showStep('step3');
      } else {
        status.textContent = `Waiting for payment confirmation… (${attempts}s)`;
      }
    } catch {}
  }, 3000);
});

function showStep(id) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// Chat
const FAQ = [
  { q: /food cost/i, a: "Food cost percentage = COGS ÷ revenue. Quick service benchmark: 28-32%. Above 35% signals a purchasing or waste problem." },
  { q: /labor/i, a: "Labor cost benchmark for QSR: 25-30% of revenue. Include all payroll, benefits, and taxes." },
  { q: /vendor|creditor/i, a: "The vendor letter explains your cash position honestly and proposes a realistic payment timeline. Vendors prefer a plan over silence." },
  { q: /bank|loan|refinanc/i, a: "The bank loan letter makes the case for refinancing your debt. It presents your financials the way lenders expect, including debt service improvement projections." },
  { q: /mca|merchant cash/i, a: "MCAs are the most expensive debt restaurant owners carry — effective APRs of 60-150% are common. Refinancing into a bank term loan should be a top priority." },
  { q: /anonymous|privacy|data|delete/i, a: "Your files are anonymized immediately — your business name is replaced with your project code. Account numbers are masked to last 4 digits. Original files are deleted after analysis." },
  { q: /how long|when|time/i, a: "Reports are generated within 10 minutes of upload. Your download link is valid for 24 hours." },
  { q: /free|re.?run/i, a: "You get 3 free re-runs within 90 days. Upload updated data anytime and get a fresh set of reports at no charge." },
  { q: /price|cost|\$24/i, a: "The service is $24.95 flat for all 3 documents. No subscriptions, no hidden fees." },
];

function getChatResponse(msg) {
  for (const item of FAQ) { if (item.q.test(msg)) return item.a; }
  return "Great question. For anything specific to your report, email support@mcflamingo.com and we'll respond within 1 business day.";
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

// Header shadow on scroll
const header = document.querySelector('.header');
window.addEventListener('scroll', () => { header.style.boxShadow = scrollY > 10 ? '0 2px 16px rgba(0,0,0,0.08)' : ''; }, { passive: true });
