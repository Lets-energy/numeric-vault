import { TOTP } from './lib/totp.js';
import { sha256 } from './lib/auth.js';

// ============================================================
// ESTADO
// ============================================================
let catalogo = [], orcamentoItems = [], editId = -1, filterCat = 'Todos', cfg = {};
let logoBase64 = '', currentUser = null, currentRole = null;
let selectedProfile = 'admin', pedidos = [], pedidoAtual = null, pedidoFilter = 'todos';
let visitorNome = '', visitorTel = '', pendingRole = null, pendingUser = null;

// ============================================================
// MODAL & UI HELPERS
// ============================================================
function fmt(v) { return 'R$\u00a0' + Number(v).toFixed(2).replace('.', ','); }
function fmtR(v) { return 'R$\u00a0' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2800);
}

// ============================================================
// INIT
// ============================================================
async function init() {
    catalogo = JSON.parse(localStorage.getItem('orca_cat') || 'null') || defaultCatalogo();
    cfg = JSON.parse(localStorage.getItem('orca_cfg') || '{}');
    logoBase64 = localStorage.getItem('orca_logo') || '';
    pedidos = JSON.parse(localStorage.getItem('orca_pedidos') || '[]');

    if (!localStorage.getItem('orca_pass_admin')) {
        localStorage.setItem('orca_pass_admin', await sha256('Lets'));
    }
    if (!localStorage.getItem('orca_pass_staff')) {
        localStorage.setItem('orca_pass_staff', await sha256('marido123'));
    }

    // Bind events to global scope
    window.selectProfile = selectProfile;
    window.doLogin = doLogin;
    window.verificar2FA = verificar2FA;
    window.voltarLogin = voltarLogin;
    window.showTab = showTab;
    window.logout = logout;
    window.setFilter = setFilter;
    window.renderCatalogo = renderCatalogo;
    window.renderQuickSearch = renderQuickSearch;
    window.addItem = addItem;
    window.chQty = chQty;
    window.rmItem = rmItem;
    window.limparOrcamento = limparOrcamento;
    window.enviarPedido = enviarPedido;
    window.filterPedidos = filterPedidos;
    window.abrirPedido = abrirPedido;
    window.mudarStatus = mudarStatus;
    window.aprovarPedido = aprovarPedido;
    window.rejeitarPedido = rejeitarPedido;
    window.gerarOrcamentoDoPedido = gerarOrcamentoDoPedido;
    window.recarregarPedido = recarregarPedido;
    window.verPreview = verPreview;
    window.fecharPreview = fecharPreview;
    window.copiarWhatsApp = copiarWhatsApp;
    window.carregarLogo = carregarLogo;
    window.abrirModalNovo = abrirModalNovo;
    window.editarItem = editarItem;
    window.excluirItem = excluirItem;
    window.fecharModal = fecharModal;
    window.previewTotal = previewTotal;
    window.salvarItem = salvarItem;
    window.salvarConfig = salvarConfig;
    window.salvarSenhas = salvarSenhas;
    window.setup2FA = setup2FA;
    window.confirmar2FA = confirmar2FA;
    window.cancelarSetup2FA = cancelarSetup2FA;
    window.desativar2FA = desativar2FA;
    window.exportarCatalogo = exportarCatalogo;
    window.importarCatalogo = importarCatalogo;
    window.toggleDesconto = toggleDesconto;
    window.removerLogo = removerLogo;
    window.calcTotais = calcTotais;

    // Initial UI state
    selectProfile('admin');
}

// ============================================================
// LOGIN LOGIC
// ============================================================
function selectProfile(p) {
    selectedProfile = p;
    ['admin', 'staff', 'visitor'].forEach((x) => {
        const btn = document.getElementById('pb-' + x);
        if (btn) btn.classList.toggle('active', x === p);
    });
    const adminFields = document.getElementById('login-fields-admin');
    const visitorFields = document.getElementById('login-fields-visitor');
    if (adminFields) adminFields.style.display = p === 'visitor' ? 'none' : 'block';
    if (visitorFields) visitorFields.style.display = p === 'visitor' ? 'block' : 'none';
    const err = document.getElementById('login-err');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
}

async function doLogin() {
    const err = document.getElementById('login-err');
    if (err) { err.style.display = 'none'; err.textContent = ''; }

    if (selectedProfile === 'visitor') {
        visitorNome = document.getElementById('l-visitor-nome').value.trim();
        visitorTel = document.getElementById('l-visitor-tel').value.trim();
        if (!visitorNome) {
            if (err) { err.textContent = 'Informe seu nome.'; err.style.display = 'block'; }
            return;
        }
        currentRole = 'visitor'; currentUser = visitorNome;
        iniciarApp(); return;
    }

    const userInput = document.getElementById('l-user').value.trim().toLowerCase();
    const passInput = document.getElementById('l-pass').value;
    const hash = await sha256(passInput);

    const admHash = localStorage.getItem('orca_pass_admin');
    const stfHash = localStorage.getItem('orca_pass_staff');
    const staffUser = localStorage.getItem('orca_user_staff') || 'marido';

    let role = null;
    if (selectedProfile === 'admin' && userInput === 'lets' && hash === admHash) role = 'admin';
    if (selectedProfile === 'staff' && userInput === staffUser && hash === stfHash) role = 'staff';

    if (!role) {
        if (err) { err.textContent = 'Usuário ou senha incorretos.'; err.style.display = 'block'; }
        return;
    }

    const totpSecret = localStorage.getItem('orca_totp_' + role);
    if (totpSecret) {
        pendingRole = role;
        pendingUser = role === 'admin' ? 'Lets' : (localStorage.getItem('orca_user_staff_display') || 'Equipe');
        document.getElementById('login-step1').style.display = 'none';
        document.getElementById('login-step2').style.display = 'block';
        document.getElementById('l-totp').value = '';
        setTimeout(() => document.getElementById('l-totp').focus(), 100);
    } else {
        currentRole = role;
        currentUser = role === 'admin' ? 'Lets' : (localStorage.getItem('orca_user_staff_display') || 'Equipe');
        iniciarApp();
    }
}

async function verificar2FA() {
    const token = document.getElementById('l-totp').value.trim();
    const secret = localStorage.getItem('orca_totp_' + pendingRole);
    const ok = await TOTP.verify(secret, token);
    if (ok) {
        currentRole = pendingRole; currentUser = pendingUser;
        pendingRole = null; pendingUser = null;
        iniciarApp();
    } else {
        toast('❌ Código inválido.');
    }
}

function voltarLogin() {
    document.getElementById('login-step2').style.display = 'none';
    document.getElementById('login-step1').style.display = 'block';
}

function iniciarApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-main').style.display = 'flex';
    document.getElementById('header-user').textContent = currentUser;

    const rt = document.getElementById('header-role');
    rt.textContent = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
    rt.className = 'role-tag role-' + currentRole;

    const isPriv = currentRole === 'admin' || currentRole === 'staff';
    document.getElementById('tab-btn-pedidos').style.display = isPriv ? 'block' : 'none';
    document.getElementById('tab-btn-catalogo').style.display = isPriv ? 'block' : 'none';
    document.getElementById('tab-btn-config').style.display = currentRole === 'admin' ? 'block' : 'none';

    if (currentRole === 'visitor') {
        document.getElementById('visitor-banner').style.display = 'block';
        document.getElementById('cli-nome').value = visitorNome;
        document.getElementById('cli-tel').value = visitorTel;
        document.getElementById('row-end-validade').style.display = 'none';
    } else {
        document.getElementById('visitor-banner').style.display = 'none';
        document.getElementById('row-end-validade').style.display = 'grid';
    }

    loadCfgUI();
    renderCatalogo();
    renderFilterTags();
    atualizarBadgePedidos();
    showTab('orcamento');
}

function logout() {
    currentRole = null; currentUser = null; orcamentoItems = [];
    document.getElementById('app-main').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-step1').style.display = 'block';
    document.getElementById('login-step2').style.display = 'none';
}

// ============================================================
// TABS & NAVIGATION
// ============================================================
function showTab(t) {
    const tabs = ['orcamento', 'pedidos', 'catalogo', 'config'];
    tabs.forEach(tab => {
        const el = document.getElementById('tab-' + tab);
        if (el) el.style.display = (tab === t) ? 'block' : 'none';

        // Update active class on tab buttons
        const btn = Array.from(document.querySelectorAll('.tab')).find(b => b.innerText.toLowerCase().includes(tab));
        if (btn) btn.classList.toggle('active', tab === t);
    });

    if (t === 'pedidos') renderPedidos();
}

// ============================================================
// CATALOG LOGIC
// ============================================================
function setFilter(c) { filterCat = c; renderFilterTags(); renderCatalogo(); }

function renderFilterTags() {
    const cats = ['Todos', ...new Set(catalogo.map(i => i.cat))];
    const el = document.getElementById('filter-tags');
    if (!el) return;
    el.innerHTML = cats.map(c =>
        `<button class="tab ${c === filterCat ? 'active' : ''}" onclick="setFilter('${c}')">${c}</button>`
    ).join('');
}

function renderCatalogo() {
    const el = document.getElementById('catalogo-list');
    if (!el) return;
    const items = catalogo.filter(i => filterCat === 'Todos' || i.cat === filterCat);
    el.innerHTML = items.map(i => `
    <div class="catalog-item">
      <div class="ci-name">${i.nome}</div>
      <div class="ci-cat">${i.cat} · ${i.un}</div>
      <div style="display:flex; justify-content:space-between; margin-top:10px;">
        <span style="font-weight:700; color:var(--accent);">${fmt(i.mat + i.mo)}</span>
        <div style="display:flex; gap:5px;">
           <button class="btn btn-ghost btn-sm" onclick="editarItem(${i.id})">✏️</button>
           <button class="btn btn-red btn-sm" onclick="excluirItem(${i.id})">🗑</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderQuickSearch() {
    const s = document.getElementById('quick-search').value.toLowerCase();
    const el = document.getElementById('quick-results');
    if (!s) { el.innerHTML = ''; return; }
    const items = catalogo.filter(i => i.nome.toLowerCase().includes(s)).slice(0, 6);
    el.innerHTML = items.map(i => `
    <div class="catalog-item clickable" onclick="addItem(${i.id})">
      <div class="ci-name">${i.nome}</div>
      <div class="ci-cat">${i.cat}</div>
      <div style="text-align:right; font-weight:700; color:var(--accent);">${fmt(i.mat + i.mo)}</div>
    </div>
  `).join('');
}

function addItem(id) {
    const item = catalogo.find(i => i.id === id);
    if (!item) return;
    const existing = orcamentoItems.find(o => o.id === id);
    if (existing) existing.qty++;
    else orcamentoItems.push({ ...item, qty: 1 });
    renderOrcamento();
    document.getElementById('quick-search').value = '';
    document.getElementById('quick-results').innerHTML = '';
    toast('✅ Adicionado: ' + item.nome);
}

// ============================================================
// BUDGET LOGIC
// ============================================================
function renderOrcamento() {
    const el = document.getElementById('items-list');
    if (!orcamentoItems.length) {
        el.innerHTML = '<div style="text-align:center; padding:40px; color:var(--muted);">Nenhum item adicionado.</div>';
        document.getElementById('totals-box').style.display = 'none';
        document.getElementById('actions-row').style.display = 'none';
        document.getElementById('desconto-section').style.display = 'none';
        return;
    }

    el.innerHTML = orcamentoItems.map((it, idx) => `
    <div class="item-row">
      <div>
        <div class="item-name">${it.nome}</div>
        <div class="item-cat">${it.cat}</div>
      </div>
      <div class="item-qty">
        <button onclick="chQty(${idx},-1)">-</button>
        <span>${it.qty}</span>
        <button onclick="chQty(${idx},1)">+</button>
      </div>
      <div class="item-price">${fmtR((it.mat + it.mo) * it.qty)}</div>
      <button class="btn btn-red btn-sm" onclick="rmItem(${idx})">✕</button>
    </div>
  `).join('');

    document.getElementById('item-count').innerText = orcamentoItems.length;
    document.getElementById('totals-box').style.display = 'block';
    document.getElementById('actions-row').style.display = 'flex';
    document.getElementById('desconto-section').style.display = currentRole !== 'visitor' ? 'block' : 'none';

    const actionsAdmin = document.getElementById('actions-admin');
    const actionsVisitor = document.getElementById('actions-visitor');
    if (actionsAdmin) actionsAdmin.style.display = currentRole !== 'visitor' ? 'flex' : 'none';
    if (actionsVisitor) actionsVisitor.style.display = currentRole === 'visitor' ? 'block' : 'none';

    calcTotais();
}

function calcTotais() {
    const subtotal = orcamentoItems.reduce((acc, i) => acc + (i.mat + i.mo) * i.qty, 0);
    const tm = orcamentoItems.reduce((acc, i) => acc + i.mat * i.qty, 0);
    const tmo = orcamentoItems.reduce((acc, i) => acc + i.mo * i.qty, 0);

    document.getElementById('total-mat').innerText = fmtR(tm);
    document.getElementById('total-mo').innerText = fmtR(tmo);

    const descCheck = document.getElementById('desc-check').checked;
    let total = subtotal;

    if (descCheck) {
        const tipo = document.getElementById('desc-tipo').value;
        const val = parseFloat(document.getElementById('desc-valor').value) || 0;
        const descVal = tipo === 'percent' ? subtotal * (val / 100) : val;
        total = subtotal - descVal;

        document.getElementById('total-subtotal-line').style.display = 'flex';
        document.getElementById('total-subtotal').innerText = fmtR(subtotal);
        document.getElementById('total-desc-line').style.display = 'flex';
        document.getElementById('total-desc-val').innerText = '- ' + fmtR(descVal);
    } else {
        document.getElementById('total-subtotal-line').style.display = 'none';
        document.getElementById('total-desc-line').style.display = 'none';
    }

    document.getElementById('total-geral').innerText = fmtR(total);
}

function chQty(idx, delta) {
    orcamentoItems[idx].qty += delta;
    if (orcamentoItems[idx].qty <= 0) orcamentoItems.splice(idx, 1);
    renderOrcamento();
}

function rmItem(idx) {
    orcamentoItems.splice(idx, 1);
    renderOrcamento();
}

function toggleDesconto() {
    const form = document.getElementById('desc-form');
    form.style.display = document.getElementById('desc-check').checked ? 'block' : 'none';
    calcTotais();
}

function limparOrcamento() {
    if (confirm('Limpar orçamento atual?')) {
        orcamentoItems = [];
        renderOrcamento();
    }
}

// ============================================================
// PEDIDOS LOGIC
// ============================================================
function enviarPedido() {
    const nome = document.getElementById('cli-nome').value;
    const tel = document.getElementById('cli-tel').value;
    if (!nome) { toast('⚠️ Informe seu nome.'); return; }

    const pedido = {
        id: 'PED-' + Date.now(),
        data: new Date().toLocaleString(),
        nome, tel,
        itens: [...orcamentoItems],
        status: 'pendente'
    };
    pedidos.unshift(pedido);
    localStorage.setItem('orca_pedidos', JSON.stringify(pedidos));
    orcamentoItems = [];
    renderOrcamento();
    toast('🚀 Pedido enviado com sucesso!');
    atualizarBadgePedidos();
}

function renderPedidos() {
    const el = document.getElementById('pedidos-list');
    if (!pedidos.length) { el.innerHTML = '<p style="text-align:center; padding:20px; color:var(--muted);">Nenhum pedido recebido.</p>'; return; }

    el.innerHTML = pedidos.map(p => `
    <div class="card" style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${p.nome}</strong><br>
          <small style="color:var(--muted);">${p.data} · ${p.itens.length} itens</small>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="abrirPedido('${p.id}')">Ver Detalhes</button>
      </div>
    </div>
  `).join('');
}

function abrirPedido(id) {
    pedidoAtual = pedidos.find(p => p.id === id);
    const content = document.getElementById('modal-pedido-content');
    content.innerHTML = `
    <div style="margin-bottom:20px;">
       <div><strong>Cliente:</strong> ${pedidoAtual.nome}</div>
       <div><strong>Tel:</strong> ${pedidoAtual.tel || '—'}</div>
    </div>
    <div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:15px;">
       ${pedidoAtual.itens.map(i => `
         <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
            <span>${i.nome} (x${i.qty})</span>
            <span>${fmtR((i.mat + i.mo) * i.qty)}</span>
         </div>
       `).join('')}
    </div>
  `;
    document.getElementById('modal-pedido').style.display = 'flex';
}

function gerarOrcamentoDoPedido() {
    orcamentoItems = [...pedidoAtual.itens];
    document.getElementById('cli-nome').value = pedidoAtual.nome;
    document.getElementById('cli-tel').value = pedidoAtual.tel;
    document.getElementById('modal-pedido').style.display = 'none';
    showTab('orcamento');
    renderOrcamento();
}

function atualizarBadgePedidos() {
    const n = pedidos.length;
    const el = document.getElementById('pedidos-count');
    el.innerText = n > 0 ? `(${n})` : '';
}

// ============================================================
// CONFIG & PERSISTENCE
// ============================================================
function loadCfgUI() {
    if (cfg.nome) document.getElementById('cfg-nome').value = cfg.nome;
    if (cfg.wpp) document.getElementById('cfg-wpp').value = cfg.wpp;
}

function salvarConfig() {
    cfg.nome = document.getElementById('cfg-nome').value;
    cfg.wpp = document.getElementById('cfg-wpp').value;
    localStorage.setItem('orca_cfg', JSON.stringify(cfg));
    toast('✅ Configurações salvas!');
}

async function salvarSenhas() {
    const adminPass = document.getElementById('cfg-pass-admin').value;
    const staffPass = document.getElementById('cfg-pass-staff').value;
    if (adminPass) localStorage.setItem('orca_pass_admin', await sha256(adminPass));
    if (staffPass) localStorage.setItem('orca_pass_staff', await sha256(staffPass));
    toast('🔐 Senhas atualizadas!');
}

function exportarCatalogo() {
    const data = JSON.stringify(catalogo, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'catalogo.json';
    a.click();
}

function importarCatalogo(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
        catalogo = JSON.parse(event.target.result);
        localStorage.setItem('orca_cat', JSON.stringify(catalogo));
        renderCatalogo();
        toast('✅ Catálogo importado!');
    };
    reader.readAsText(file);
}

// ============================================================
// 2FA SETUP
// ============================================================
let setupSecret = '';
function setup2FA(role) {
    setupSecret = TOTP.randomSecret();
    document.getElementById('totp-secret-display').innerText = 'Chave: ' + setupSecret;
    document.getElementById('qr-setup-box').style.display = 'block';
    pendingRole = role;
}

async function confirmar2FA() {
    const code = document.getElementById('totp-confirm-code').value;
    const ok = await TOTP.verify(setupSecret, code);
    if (ok) {
        localStorage.setItem('orca_totp_' + pendingRole, setupSecret);
        toast('✅ 2FA Ativado!');
        document.getElementById('qr-setup-box').style.display = 'none';
    } else {
        toast('❌ Código incorreto.');
    }
}

function cancelarSetup2FA() { document.getElementById('qr-setup-box').style.display = 'none'; }

// ============================================================
// ITEM MODAL
// ============================================================
function abrirModalNovo() {
    editId = -1;
    document.getElementById('modal-title').innerText = 'Novo Item';
    document.getElementById('mi-nome').value = '';
    document.getElementById('mi-mat').value = 0;
    document.getElementById('mi-mo').value = 0;
    document.getElementById('modal-item').style.display = 'flex';
}

function fecharModal() { document.getElementById('modal-item').style.display = 'none'; }

function previewTotal() {
    const mat = parseFloat(document.getElementById('mi-mat').value) || 0;
    const mo = parseFloat(document.getElementById('mi-mo').value) || 0;
    document.getElementById('mi-total-preview').innerText = fmt(mat + mo);
}

function salvarItem() {
    const nome = document.getElementById('mi-nome').value;
    const mat = parseFloat(document.getElementById('mi-mat').value) || 0;
    const mo = parseFloat(document.getElementById('mi-mo').value) || 0;
    const cat = document.getElementById('mi-cat').value;
    const un = document.getElementById('mi-unidade').value;

    if (editId === -1) {
        catalogo.push({ id: Date.now(), nome, mat, mo, cat, un });
    } else {
        const idx = catalogo.findIndex(i => i.id === editId);
        catalogo[idx] = { id: editId, nome, mat, mo, cat, un };
    }
    localStorage.setItem('orca_cat', JSON.stringify(catalogo));
    fecharModal();
    renderCatalogo();
    toast('💾 Item salvo!');
}

function editarItem(id) {
    editId = id;
    const item = catalogo.find(i => i.id === id);
    document.getElementById('modal-title').innerText = 'Editar Item';
    document.getElementById('mi-nome').value = item.nome;
    document.getElementById('mi-mat').value = item.mat;
    document.getElementById('mi-mo').value = item.mo;
    document.getElementById('mi-cat').value = item.cat;
    document.getElementById('mi-unidade').value = item.un;
    previewTotal();
    document.getElementById('modal-item').style.display = 'flex';
}

function excluirItem(id) {
    if (confirm('Excluir item do catálogo?')) {
        catalogo = catalogo.filter(i => i.id !== id);
        localStorage.setItem('orca_cat', JSON.stringify(catalogo));
        renderCatalogo();
    }
}

// ============================================================
// PREVIEW & WHATSAPP
// ============================================================
function verPreview() {
    const content = document.getElementById('preview-content');
    const nome = document.getElementById('cli-nome').value;
    const tel = document.getElementById('cli-tel').value;
    const end = document.getElementById('cli-end').value;

    let html = `
    <div style="border-bottom: 2px solid var(--accent); padding-bottom: 20px; margin-bottom: 20px; display:flex; justify-content:space-between;">
       <div>
         <h1 style="font-family:Syne; font-weight:800; font-size:1.5rem; margin:0;">${cfg.nome || 'ORCAFÁCIL'}</h1>
         <div style="font-size:0.8rem; color:#666;">Sistema de Orçamentos Profissionais</div>
       </div>
       <div style="text-align:right;">
         <div style="font-weight:700;">Orçamento #${Date.now().toString().slice(-6)}</div>
         <div style="font-size:0.8rem;">${new Date().toLocaleDateString()}</div>
       </div>
    </div>
    <div style="margin-bottom:20px;">
       <strong>Cliente:</strong> ${nome}<br>
       ${tel ? `<strong>Tel:</strong> ${tel}<br>` : ''}
       ${end ? `<strong>Endereço:</strong> ${end}<br>` : ''}
    </div>
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
       <thead>
         <tr style="background:#f5f5f5; text-align:left;">
            <th style="padding:10px;">Descrição</th>
            <th style="padding:10px; text-align:center;">Qtd</th>
            <th style="padding:10px; text-align:right;">Unitário</th>
            <th style="padding:10px; text-align:right;">Total</th>
         </tr>
       </thead>
       <tbody>
         ${orcamentoItems.map(i => `
           <tr style="border-bottom:1px solid #eee;">
              <td style="padding:10px;">${i.nome}</td>
              <td style="padding:10px; text-align:center;">${i.qty}</td>
              <td style="padding:10px; text-align:right;">${fmt(i.mat + i.mo)}</td>
              <td style="padding:10px; text-align:right;">${fmt((i.mat + i.mo) * i.qty)}</td>
           </tr>
         `).join('')}
       </tbody>
    </table>
    <div style="text-align:right; font-size:1.2rem; font-weight:800;">
       TOTAL: <span style="color:var(--accent2);">${document.getElementById('total-geral').innerText}</span>
    </div>
  `;
    content.innerHTML = html;
    document.getElementById('preview-card').style.display = 'block';
    document.getElementById('preview-card').scrollIntoView({ behavior: 'smooth' });
}

function fecharPreview() { document.getElementById('preview-card').style.display = 'none'; }

function copiarWhatsApp() {
    const nome = document.getElementById('cli-nome').value;
    const total = document.getElementById('total-geral').innerText;
    let txt = `*ORÇAMENTO — ${cfg.nome || 'OrcaFácil'}*\n\n`;
    txt += `👤 Cliente: ${nome}\n\n`;
    txt += `*ITENS:*\n`;
    orcamentoItems.forEach(i => {
        txt += `• ${i.nome} (x${i.qty}) — ${fmt((i.mat + i.mo) * i.qty)}\n`;
    });
    txt += `\n*💰 TOTAL: ${total}*\n`;
    navigator.clipboard.writeText(txt);
    toast('📋 Copiado para o WhatsApp!');
}

// ============================================================
// DEFAULTS
// ============================================================
function defaultCatalogo() {
    return [
        { id: 1, nome: 'Tomada simples 2P+T (com material)', cat: 'Elétrica', un: 'ponto', mat: 35, mo: 90 },
        { id: 2, nome: 'Tomada dupla 2P+T (com material)', cat: 'Elétrica', un: 'ponto', mat: 48, mo: 100 },
        { id: 3, nome: 'Tomada USB dupla (com material)', cat: 'Elétrica', un: 'ponto', mat: 70, mo: 100 },
        { id: 70, nome: 'Montagem de móvel simples', cat: 'Marido de Aluguel', un: 'vb', mat: 0, mo: 130 },
    ];
}

init();
