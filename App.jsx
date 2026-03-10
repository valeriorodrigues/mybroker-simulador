import { useState, useEffect, useMemo, useRef } from 'react';
import { storage } from './storage.js';

// ─── HELPERS ────────────────────────────────────────────────────────────────────
const R  = v => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }) ?? '-';
const Pt = (v, d = 1) => `${Number(v).toFixed(d).replace('.', ',')}%`;
const PMT = (pv, apr, n) => {
  if (!pv || !n) return 0;
  const i = (1 + apr / 100) ** (1 / 12) - 1;
  if (i === 0) return pv / n;
  return pv * (i * (1 + i) ** n) / ((1 + i) ** n - 1);
};
const uid = () => 'MB-' + Date.now().toString(36).toUpperCase().slice(-6);
const fmt = ts => new Date(ts).toLocaleDateString('pt-BR');

// ─── CONSTANTS ──────────────────────────────────────────────────────────────────
const PRODUTOS = {
  imovel:         { label: 'Imóvel',               icon: '🏡', subtipos: ['Aquisição', 'Construção', 'Aquisição e Construção', 'Reforma', 'Interveniente Quitante', 'Alavancagem Patrimonial'] },
  veiculo_leve:   { label: 'Veículo Leve',         icon: '🚗', subtipos: ['Automóvel', 'SUV', 'Pickup Leve', 'Van'] },
  veiculo_pesado: { label: 'Veículo Pesado',       icon: '🚛', subtipos: ['Caminhão', 'Ônibus', 'Implemento Rodoviário', 'Toco/Truck'] },
  maquinas:       { label: 'Máquinas Agrícolas',   icon: '🚜', subtipos: ['Trator', 'Colheitadeira', 'Implemento Agrícola', 'Irrigação', 'Pulverizador'] },
  maquinas_ind:   { label: 'Máquinas',             icon: '🏗️', subtipos: ['Industrial', 'Construção Civil', 'Mineração', 'Energia', 'Portuária', 'Outros'] },
  motocicleta:    { label: 'Motocicleta',          icon: '🏍️', subtipos: ['Urbana', 'Trail/Adventure', 'Esportiva', 'Elétrica'] },
  servicos:       { label: 'Serviços',             icon: '⚙️', subtipos: ['Obras e Reformas', 'Tecnologia', 'Educação', 'Saúde', 'Energia Solar', 'Outros'] },
};

const TIPOS_PROP = [
  { id: 'simplificada', label: 'Simplificada', desc: 'Dados essenciais · 1 página' },
  { id: 'padrao',       label: 'Padrão',       desc: 'Equilibrada · 1 página' },
  { id: 'analitica',    label: 'Analítica',    desc: 'Completa com todos os indicadores' },
];

const SEGMENTO_MAP = {
  'IMÓVEL': 'imovel', 'IMOVEL': 'imovel', 'IMÓVEL RESIDENCIAL': 'imovel', 'IMÓVEL COMERCIAL': 'imovel',
  'VEÍCULO LEVE': 'veiculo_leve', 'VEICULO LEVE': 'veiculo_leve', 'AUTOMÓVEL': 'veiculo_leve',
  'VEÍCULO PESADO': 'veiculo_pesado', 'CAMINHÃO': 'veiculo_pesado',
  'MÁQUINAS AGRÍCOLAS': 'maquinas', 'MAQUINAS AGRICOLAS': 'maquinas', 'AGRÍCOLA': 'maquinas',
  'MÁQUINAS': 'maquinas_ind', 'MAQUINAS': 'maquinas_ind', 'INDUSTRIAL': 'maquinas_ind',
  'MOTOCICLETA': 'motocicleta', 'MOTO': 'motocicleta',
  'SERVIÇOS': 'servicos', 'SERVICOS': 'servicos',
};

// ─── CALCULATIONS ────────────────────────────────────────────────────────────────
function calcSim({ credito = 200000, taxa = 9.2, prazo = 84, lancePct = 20, hist = [40, 41, 51] }) {
  const ps = PMT(credito, taxa, prazo);
  const lv = credito * lancePct / 100;
  const pl = PMT(credito - lv, taxa, prazo);
  const tl = lv + pl * prazo;
  const anos = prazo / 12;
  const cet = tl > 0 && credito > 0 ? ((tl / credito) ** (12 / prazo) - 1) * 100 : 0;
  const pmtCEF = PMT(credito, 12.5, prazo);
  const pmtBco = PMT(credito, 17.5, prazo);
  const ttCEF = pmtCEF * prazo; const ttBco = pmtBco * prazo;
  const ecCEF = ttCEF - tl; const ecBco = ttBco - tl;
  const fi = 1.058 ** anos;
  const cf = credito * fi; const inccGanho = cf - credito; const inccPct = (fi - 1) * 100;
  const vv = credito * 1.12; const ct3 = lv + pl * 3; const gvenda = vv - ct3;
  const roi = ct3 > 0 ? (gvenda / ct3) * 100 : 0;
  const mh = hist?.length ? Math.min(...hist) : 20;
  const prob = lancePct >= mh ? 95 : lancePct >= mh * 0.85 ? 75 : lancePct >= mh * 0.7 ? 50 : 20;
  const probColor = prob >= 75 ? '#34D399' : prob >= 50 ? '#C9A84C' : '#F87171';
  return { ps, lv, pl, tl, cet, pmtCEF, pmtBco, ttCEF, ttBco, ecCEF, ecBco, cf, inccGanho, inccPct, vv, gvenda, roi, mh, prob, probColor, anos };
}

// ─── CITYBENS AI EXTRACTION ──────────────────────────────────────────────────────
async function extractCitybens(base64, mimeType) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          {
            type: 'text',
            text: `Analise esta proposta de consórcio da Citybens e extraia os dados. Retorne APENAS JSON válido, sem markdown, sem texto extra:
{
  "segmento": "IMÓVEL|VEÍCULO LEVE|VEÍCULO PESADO|MÁQUINAS AGRÍCOLAS|MÁQUINAS|MOTOCICLETA|SERVIÇOS",
  "grupos": [{"numero":"XXXX","prazo":231,"credito":400000,"parcela_inicial":1490.91,"lance_pct":40,"parcela_apos":1437.00}],
  "totais": {
    "credito_total": 700000,
    "parcela_inicial": 2609.09,
    "lance_pct": 40,
    "lance_total": 280000,
    "parcela_apos_contemplacao": 2514.74,
    "taxa_mensal": 0.33,
    "taxa_anual": 3.98,
    "prazo": 231
  }
}`
          }
        ]
      }]
    })
  });
  const d = await resp.json();
  const text = d.content?.find(b => b.type === 'text')?.text || '';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ─── CSS ─────────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#060A12;--card:#0F1928;--bo:rgba(201,168,76,.18);--bo2:rgba(255,255,255,.08);
  --gold:#C9A84C;--gold2:#E8C56E;--text:rgba(255,255,255,.92);--muted:rgba(255,255,255,.45);
  --dim:rgba(255,255,255,.22);--green:#34D399;--red:#F87171;--blue:#60A5FA;
}
body{background:var(--bg);font-family:'DM Sans',sans-serif;color:var(--text);min-height:100vh}
.nav{background:rgba(13,21,37,.97);border-bottom:1px solid var(--bo);padding:0 14px;display:flex;align-items:center;justify-content:space-between;height:50px;position:sticky;top:0;z-index:50;backdrop-filter:blur(16px)}
.brand{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:700;color:var(--gold)}
.brand-sub{font-size:8px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;font-weight:400}
.nav-r{display:flex;gap:5px;align-items:center}
.main{max-width:580px;margin:0 auto;padding:18px 13px 60px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:9px 14px;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif;border:none;white-space:nowrap}
.btn-gold{background:linear-gradient(135deg,#C9A84C,#E8C56E);color:#060A12}
.btn-gold:hover{transform:translateY(-1px);box-shadow:0 5px 16px rgba(201,168,76,.3)}
.btn-ghost{background:transparent;border:1px solid rgba(201,168,76,.3);color:var(--gold)}
.btn-ghost:hover{background:rgba(201,168,76,.08)}
.btn-dim{background:rgba(255,255,255,.06);border:1px solid var(--bo2);color:var(--muted)}
.btn-dim:hover{background:rgba(255,255,255,.1);color:var(--text)}
.btn-danger{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:var(--red)}
.btn-sm{padding:6px 11px;font-size:11px;border-radius:7px}
.btn-full{width:100%}
.btn:disabled{opacity:.3;cursor:not-allowed!important;transform:none!important}
.field{margin-bottom:11px}
.lbl{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px;display:block}
.inp,.sel{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.11);border-radius:9px;padding:9px 11px;font-size:13px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;transition:border .2s;-webkit-appearance:none}
.inp:focus,.sel:focus{border-color:rgba(201,168,76,.5)}
.sel option{background:#111827;color:var(--text)}
input[type=range]{width:100%;height:4px;appearance:none;background:rgba(255,255,255,.1);border-radius:2px;cursor:pointer;margin:7px 0}
input[type=range]::-webkit-slider-thumb{appearance:none;width:15px;height:15px;background:linear-gradient(135deg,var(--gold),var(--gold2));border-radius:50%}
.tog-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.tog-row:last-child{border-bottom:none;padding-bottom:0}
.tog-label{font-size:12px;font-weight:500}
.tog-desc{font-size:10px;color:var(--muted);margin-top:1px}
.tog{width:36px;height:19px;background:rgba(255,255,255,.1);border-radius:10px;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0;border:none}
.tog.on{background:linear-gradient(135deg,var(--gold),var(--gold2))}
.tog::after{content:'';position:absolute;top:2px;left:2px;width:15px;height:15px;background:#fff;border-radius:50%;transition:transform .2s}
.tog.on::after{transform:translateX(17px)}
.card{background:var(--card);border:1px solid var(--bo);border-radius:13px;padding:14px}
.card-sel{border-color:var(--gold)!important;background:rgba(201,168,76,.06)!important}
.card-click{cursor:pointer;transition:all .2s}
.card-click:hover:not(.card-sel){border-color:rgba(201,168,76,.3);transform:translateY(-1px)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.g4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:7px}
.stpr{display:flex;align-items:center;justify-content:center;margin-bottom:18px}
.st-dot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0}
.st-dot.done{background:linear-gradient(135deg,var(--gold),var(--gold2));color:#060A12}
.st-dot.active{background:rgba(201,168,76,.18);border:2px solid var(--gold);color:var(--gold)}
.st-dot.idle{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:var(--dim)}
.st-line{width:22px;height:1px;background:rgba(255,255,255,.08)}
.st-line.done{background:rgba(201,168,76,.4)}
.pg-title{font-family:'Cormorant Garamond',serif;font-size:clamp(21px,5vw,27px);font-weight:700;line-height:1.2}
.pg-sub{font-size:11px;color:var(--muted);margin-top:4px;font-weight:300}
.sec-title{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:700;margin-bottom:3px}
.sec-sub{font-size:11px;color:var(--muted);margin-bottom:11px}
.divhr{height:1px;background:rgba(255,255,255,.06);margin:14px 0}
.met{background:var(--card);border:1px solid var(--bo);border-radius:11px;padding:11px}
.met-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:3px}
.met-val{font-family:'Cormorant Garamond',serif;font-size:clamp(16px,3.5vw,21px);font-weight:700;line-height:1.2}
.met-note{font-size:10px;color:var(--muted);margin-top:2px}
.gold .met-val{color:var(--gold)}.green .met-val{color:var(--green)}.red .met-val{color:var(--red)}
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:5px 0;text-align:left;border-bottom:1px solid rgba(255,255,255,.08);font-weight:500}
.tbl td{padding:7px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
.tbl td:last-child{text-align:right;font-weight:600}
.c-green{color:var(--green)}.c-gold{color:var(--gold)}.c-red{color:var(--red)}
.badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:9px;font-weight:700;letter-spacing:.4px;margin-left:3px}
.bg-gold{background:rgba(201,168,76,.15);color:var(--gold)}
.bg-green{background:rgba(52,211,153,.15);color:var(--green)}
.bg-red{background:rgba(248,113,113,.15);color:var(--red)}
.bg-blue{background:rgba(96,165,250,.15);color:var(--blue)}
.ph{background:linear-gradient(135deg,#0D1525 0%,#0F1E35 100%);border:1px solid var(--bo);border-radius:14px;padding:20px;margin-bottom:10px;position:relative;overflow:hidden}
.ph::before{content:'';position:absolute;top:-40px;right:-40px;width:150px;height:150px;background:radial-gradient(circle,rgba(201,168,76,.09),transparent 70%);pointer-events:none}
.ph-eye{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:var(--gold);margin-bottom:6px;opacity:.7}
.ph-name{font-family:'Cormorant Garamond',serif;font-size:clamp(18px,4.5vw,24px);font-weight:700;line-height:1.2}
.ph-sub{font-size:11px;color:var(--muted);margin-top:4px}
.ph-row{display:flex;align-items:center;gap:5px;margin-top:10px;flex-wrap:wrap}
.bar-track{height:6px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px;transition:width .6s}
.disc{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:8px 11px;font-size:10px;color:var(--muted);line-height:1.6;margin-top:10px}
.li{background:var(--card);border:1px solid var(--bo);border-radius:11px;padding:11px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:all .2s;margin-bottom:7px}
.li:hover{border-color:rgba(201,168,76,.3);transform:translateY(-1px)}
.li-icon{width:38px;height:38px;border-radius:9px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.2);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
.li-info{flex:1;min-width:0}
.li-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.li-meta{font-size:10px;color:var(--muted);margin-top:2px}
.li-val{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:700;color:var(--gold);text-align:right;flex-shrink:0}
.vc-inp{background:rgba(255,255,255,.07);border:2px solid rgba(201,168,76,.3);border-radius:11px;padding:12px 14px;font-size:17px;font-weight:700;font-family:'DM Sans',sans-serif;color:var(--text);text-align:center;letter-spacing:2px;outline:none;width:100%;margin:9px 0}
.vc-inp:focus{border-color:var(--gold)}
.upload-zone{border:2px dashed rgba(201,168,76,.3);border-radius:13px;padding:24px 16px;text-align:center;cursor:pointer;transition:all .2s;background:rgba(201,168,76,.03)}
.upload-zone:hover{border-color:var(--gold);background:rgba(201,168,76,.07)}
.extract-card{background:linear-gradient(135deg,rgba(201,168,76,.08),rgba(201,168,76,.03));border:1px solid rgba(201,168,76,.25);border-radius:13px;padding:14px}
.grupos-table{width:100%;border-collapse:collapse;margin-top:7px}
.grupos-table th{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:4px 5px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08);font-weight:500}
.grupos-table td{padding:5px 5px;font-size:11px;border-bottom:1px solid rgba(255,255,255,.04)}
.spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(201,168,76,.3);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
.cb-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.25);color:#93C5FD}
.consultor-card{background:var(--card);border:1px solid var(--bo);border-radius:11px;padding:13px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:0}
@media print{
  .nav,.btn,.disc,.no-print{display:none!important}
  body,html{background:#fff!important;color:#111!important}
  .ph{background:#f8f9fa!important;border-color:#e5e7eb!important}
  .ph-eye{color:#7c3aed!important}.ph-name{color:#111!important}.ph-sub{color:#777!important}
  .card,.met,.consultor-card,.extract-card{background:#fff!important;border-color:#e5e7eb!important;box-shadow:none!important}
  .gold .met-val{color:#92400e!important}.green .met-val{color:#047857!important}.red .met-val{color:#dc2626!important}
  .c-green{color:#047857!important}.c-gold{color:#92400e!important}.c-red{color:#dc2626!important}
  .badge.bg-green{background:#d1fae5!important;color:#047857!important}
  .badge.bg-gold{background:#fef3c7!important;color:#92400e!important}
  .tbl td,.grupos-table td{color:#111!important}
  .met-lbl,.tbl th,.grupos-table th,.met-note,.ph-sub{color:#777!important}
  .divhr{background:#e5e7eb!important}
  @page{size:A4;margin:12mm}
}`;

// ─── MAIN APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('list');
  const [proposals, setProps] = useState([]);
  const [current, setCurrent] = useState(null);
  const [step, setStep] = useState(0);
  const [viewCode, setViewCode] = useState('');
  const [viewProp, setViewProp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  function showToast(msg, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(''), 3000);
  }

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const res = await storage.list('prop:');
      if (res?.keys?.length) {
        const arr = await Promise.all(res.keys.map(async k => {
          try { const r = await storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; }
        }));
        setProps(arr.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt));
      }
    } catch {}
    setLoading(false);
  }

  async function saveProp(p) {
    try { await storage.set(`prop:${p.id}`, JSON.stringify(p)); } catch {}
    setProps(prev => [p, ...prev.filter(x => x.id !== p.id)]);
  }

  async function delProp(id) {
    try { await storage.delete(`prop:${id}`); } catch {}
    setProps(prev => prev.filter(x => x.id !== id));
  }

  function newProp() {
    setCurrent({
      id: uid(), createdAt: Date.now(),
      cliente: { nome: '', telefone: '', email: '' },
      produto: { tipo: '', subtipo: '' },
      grupo: { nome: 'BB Consórcios', prazo: 84, taxa: 9.20, credito: 200000, lancePct: 20, hist: [40, 41, 51] },
      opcoes: { comparativo: true, cet: true, incc: true, ganhoVenda: false },
      tipoProposta: 'padrao',
      citybens: null
    });
    setStep(0); setView('create');
  }

  async function handleViewCode() {
    try {
      const r = await storage.get(`prop:${viewCode.trim().toUpperCase()}`);
      if (r) setViewProp(JSON.parse(r.value));
      else showToast('Proposta não encontrada. Verifique o código.', true);
    } catch { showToast('Erro ao buscar proposta.', true); }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {toast && (
        <div style={{
          position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
          background: toast.err ? 'rgba(248,113,113,.15)' : 'rgba(52,211,153,.15)',
          border: `1px solid ${toast.err ? 'rgba(248,113,113,.3)' : 'rgba(52,211,153,.3)'}`,
          color: toast.err ? '#F87171' : '#34D399',
          padding: '9px 18px', borderRadius: 9, zIndex: 200, fontSize: 12,
          fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap'
        }}>{toast.msg}</div>
      )}
      <div>
        <nav className="nav">
          <div>
            <div className="brand">My Broker</div>
            <div className="brand-sub">Simulador de Propostas</div>
          </div>
          <div className="nav-r">
            {view !== 'list' && <button className="btn btn-dim btn-sm" onClick={() => { setView('list'); setViewProp(null); }}>← Lista</button>}
            {view === 'list' && (
              <>
                <button className="btn btn-dim btn-sm" onClick={() => { setView('viewer'); setViewProp(null); }}>🔍 Ver Proposta</button>
                <button className="btn btn-gold btn-sm" onClick={newProp}>+ Nova</button>
              </>
            )}
            {(view === 'preview' || viewProp) && (
              <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨 PDF</button>
            )}
          </div>
        </nav>
        <div className="main">
          {view === 'list' && <ListView proposals={proposals} loading={loading} onNew={newProp} onOpen={p => { setCurrent(p); setView('preview'); }} onDelete={delProp} />}
          {view === 'create' && current && <CreateView data={current} step={step} onChange={setCurrent} onStep={setStep} onSave={async p => { await saveProp(p); setCurrent(p); setView('preview'); showToast('✓ Proposta salva! Código: ' + p.id); }} onCancel={() => setView('list')} showToast={showToast} />}
          {view === 'preview' && current && <ProposalView proposal={current} onCopy={id => { navigator.clipboard?.writeText(id); showToast('Código ' + id + ' copiado!'); }} />}
          {view === 'viewer' && <ViewerView code={viewCode} onCode={setViewCode} onSearch={handleViewCode} proposal={viewProp} onCopy={id => { navigator.clipboard?.writeText(id); showToast('Código copiado!'); }} />}
        </div>
      </div>
    </>
  );
}

// ─── LIST ────────────────────────────────────────────────────────────────────────
function ListView({ proposals, loading, onNew, onOpen, onDelete }) {
  if (loading) return <div style={{ textAlign: 'center', padding: 50, color: 'var(--muted)' }}>Carregando...</div>;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div className="pg-title">Propostas</div>
          <div className="pg-sub">{proposals.length} salva{proposals.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      {proposals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '44px 16px' }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>📋</div>
          <div className="pg-title" style={{ fontSize: 19, marginBottom: 5 }}>Nenhuma proposta ainda</div>
          <div className="pg-sub" style={{ marginBottom: 20 }}>Crie ou importe uma proposta Citybens</div>
          <button className="btn btn-gold" onClick={onNew}>+ Criar Proposta</button>
        </div>
      ) : proposals.map(p => (
        <div key={p.id} className="li" onClick={() => onOpen(p)}>
          <div className="li-icon">{PRODUTOS[p.produto.tipo]?.icon || '📄'}</div>
          <div className="li-info">
            <div className="li-name">
              {p.cliente.nome || 'Cliente sem nome'}
              {p.citybens && <span className="cb-badge" style={{ marginLeft: 6 }}>📎 Citybens</span>}
            </div>
            <div className="li-meta">{PRODUTOS[p.produto.tipo]?.label || '—'} · {p.produto.subtipo || '—'} · {p.grupo.prazo}m · {p.id} · {fmt(p.createdAt)}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="li-val">{R(p.grupo.credito)}</div>
            <button className="btn btn-danger btn-sm" style={{ marginTop: 4, width: '100%' }}
              onClick={e => { e.stopPropagation(); if (window.confirm('Excluir esta proposta?')) onDelete(p.id); }}>
              Excluir
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CREATE ───────────────────────────────────────────────────────────────────────
function CreateView({ data, step, onChange, onStep, onSave, onCancel, showToast }) {
  const upd = (path, val) => {
    const d = JSON.parse(JSON.stringify(data));
    const keys = path.split('.');
    let o = d;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = val;
    onChange(d);
  };
  const canNext = [
    !!(data.cliente.nome),
    !!(data.produto.tipo && data.produto.subtipo),
    !!(data.grupo.credito && data.grupo.prazo && data.grupo.taxa),
    true
  ];
  const STEPS = ['Cliente', 'Produto', 'Simulação', 'Formato'];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div className="pg-title">Nova Proposta</div>
        <div className="pg-sub">Código: <strong style={{ color: 'var(--gold)' }}>{data.id}</strong></div>
      </div>
      <div className="stpr">
        {STEPS.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`st-dot ${i < step ? 'done' : i === step ? 'active' : 'idle'}`}>{i < step ? '✓' : i + 1}</div>
            {i < STEPS.length - 1 && <div className={`st-line ${i < step ? 'done' : ''}`} />}
          </div>
        ))}
      </div>
      {step === 0 && <StepCliente data={data} upd={upd} />}
      {step === 1 && <StepProduto data={data} upd={upd} />}
      {step === 2 && <StepSimulacao data={data} upd={upd} onChange={onChange} showToast={showToast} />}
      {step === 3 && <StepFormato data={data} upd={upd} />}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <button className="btn btn-gold btn-full" disabled={!canNext[step]}
          onClick={() => { if (step < 3) onStep(step + 1); else onSave(data); }}>
          {step < 3 ? 'Continuar →' : '✓ Gerar Proposta'}
        </button>
        {step > 0 && <button className="btn btn-dim btn-full" onClick={() => onStep(step - 1)}>← Voltar</button>}
        <button className="btn btn-dim btn-full" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function StepCliente({ data, upd }) {
  return (
    <div>
      <div className="sec-title">Dados do Cliente</div>
      <div className="sec-sub">Informações que aparecerão na proposta</div>
      <div className="field">
        <label className="lbl">Nome completo *</label>
        <input className="inp" value={data.cliente.nome} onChange={e => upd('cliente.nome', e.target.value)} placeholder="Ex: João Carlos Pereira" />
      </div>
      <div className="g2">
        <div className="field">
          <label className="lbl">Telefone / WhatsApp</label>
          <input className="inp" value={data.cliente.telefone} onChange={e => upd('cliente.telefone', e.target.value)} placeholder="(34) 9.9999-9999" />
        </div>
        <div className="field">
          <label className="lbl">E-mail</label>
          <input className="inp" value={data.cliente.email} onChange={e => upd('cliente.email', e.target.value)} placeholder="joao@email.com" />
        </div>
      </div>
    </div>
  );
}

function StepProduto({ data, upd }) {
  return (
    <div>
      <div className="sec-title">Produto</div>
      <div className="sec-sub">Selecione o ramo e finalidade do crédito</div>
      <div className="g4" style={{ marginBottom: 12 }}>
        {Object.entries(PRODUTOS).map(([k, v]) => (
          <div key={k} className={`card card-click${data.produto.tipo === k ? ' card-sel' : ''}`}
            style={{ textAlign: 'center', padding: '12px 6px' }}
            onClick={() => { upd('produto.tipo', k); upd('produto.subtipo', ''); }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{v.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.3 }}>{v.label}</div>
          </div>
        ))}
      </div>
      {data.produto.tipo && (
        <div className="field">
          <label className="lbl">Finalidade</label>
          <select className="sel" value={data.produto.subtipo} onChange={e => upd('produto.subtipo', e.target.value)}>
            <option value="">Selecione...</option>
            {PRODUTOS[data.produto.tipo].subtipos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function StepSimulacao({ data, upd, onChange, showToast }) {
  const fileRef = useRef();
  const [extracting, setExtracting] = useState(false);
  const [imgPreview, setImgPreview] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    const mime = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = async e => {
      const b64 = e.target.result.split(',')[1];
      setImgPreview(e.target.result);
      setExtracting(true);
      try {
        const extracted = await extractCitybens(b64, mime);
        const t = extracted.totais;
        const segKey = SEGMENTO_MAP[extracted.segmento?.toUpperCase()] || data.produto.tipo || 'imovel';
        const lancePct = t.lance_pct || (t.lance_total && t.credito_total ? Math.round(t.lance_total / t.credito_total * 100) : 20);
        const novoGrupo = {
          nome: `Citybens · ${extracted.grupos?.map(g => g.numero).join(' + ') || 'Grupo'}`,
          prazo: t.prazo || 84,
          taxa: t.taxa_anual || 9.2,
          credito: t.credito_total || 200000,
          lancePct,
          hist: data.grupo.hist,
          parcela_inicial: t.parcela_inicial,
          parcela_apos: t.parcela_apos_contemplacao,
        };
        const d = JSON.parse(JSON.stringify(data));
        d.grupo = novoGrupo;
        d.citybens = { extraido: extracted, grupos: extracted.grupos, segmento: extracted.segmento };
        if (segKey && !d.produto.tipo) d.produto.tipo = segKey;
        onChange(d);
        showToast('✓ Proposta Citybens importada com sucesso!');
      } catch (err) {
        showToast('Erro ao ler a proposta. Tente outra imagem.', true);
      }
      setExtracting(false);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  return (
    <div>
      <div className="sec-title">Dados da Simulação</div>
      <div className="sec-sub">Preencha manualmente ou importe uma proposta Citybens</div>
      <div style={{ marginBottom: 14 }}>
        <div className={`upload-zone`}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !extracting && fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
          {extracting ? (
            <div style={{ color: 'var(--gold)', fontSize: 13 }}>
              <span className="spin" />Analisando proposta com IA...
            </div>
          ) : imgPreview ? (
            <div>
              <img src={imgPreview} style={{ maxWidth: '100%', maxHeight: 80, borderRadius: 7, marginBottom: 7, opacity: .7 }} alt="preview" />
              <div style={{ fontSize: 11, color: 'var(--gold)' }}>✓ Importada · Clique para trocar</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 26, marginBottom: 6 }}>📎</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>Importar Proposta Citybens</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Arraste ou clique · imagem ou PDF</div>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>A IA extrai todos os campos automaticamente</div>
            </div>
          )}
        </div>
        {data.citybens && (
          <div className="extract-card" style={{ marginTop: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span className="cb-badge">📎 Citybens</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{data.citybens.segmento} · {data.citybens.grupos?.length || 1} cota{(data.citybens.grupos?.length || 1) > 1 ? 's' : ''}</span>
            </div>
            {data.citybens.grupos?.length > 1 && (
              <table className="grupos-table">
                <thead><tr><th>Grupo</th><th>Prazo</th><th>Crédito</th><th>Parcela</th><th>Lance</th><th>Pós</th></tr></thead>
                <tbody>{data.citybens.grupos.map((g, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--gold)', fontWeight: 600 }}>{g.numero}</td>
                    <td>{g.prazo}m</td>
                    <td>{R(g.credito)}</td>
                    <td>{R(g.parcela_inicial)}</td>
                    <td>{Pt(g.lance_pct)}</td>
                    <td style={{ color: 'var(--green)' }}>{R(g.parcela_apos)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="divhr" />
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 9, textTransform: 'uppercase', letterSpacing: '.7px', fontWeight: 600 }}>Dados do Grupo</div>

      <div className="field">
        <label className="lbl">Nome do Grupo / Administradora</label>
        <input className="inp" value={data.grupo.nome} onChange={e => upd('grupo.nome', e.target.value)} placeholder="Ex: Grupo 1610 · BB Consórcios" />
      </div>
      <div className="field">
        <label className="lbl">Valor do Crédito: {R(data.grupo.credito)}</label>
        <input type="range" min={30000} max={800000} step={5000} value={data.grupo.credito}
          onChange={e => upd('grupo.credito', +e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}>
          <span>{R(30000)}</span><span>{R(800000)}</span>
        </div>
      </div>
      <div className="g2">
        <div className="field">
          <label className="lbl">Prazo (meses)</label>
          <input className="inp" type="number" value={data.grupo.prazo} onChange={e => upd('grupo.prazo', +e.target.value)} min={12} max={240} />
        </div>
        <div className="field">
          <label className="lbl">Taxa anual (%)</label>
          <input className="inp" type="number" step={0.01} value={data.grupo.taxa} onChange={e => upd('grupo.taxa', +e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="lbl">Lance ofertado: {Pt(data.grupo.lancePct)}</label>
        <input type="range" min={0} max={50} step={0.5} value={data.grupo.lancePct}
          onChange={e => upd('grupo.lancePct', +e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}>
          <span>0%</span><span>25%</span><span>50%</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.7px', fontWeight: 600, marginBottom: 6 }}>
          Histórico de Lances (últimas 3 assembleias)
        </div>
        <div className="g3">
          {data.grupo.hist.map((h, i) => (
            <div key={i} className="field" style={{ marginBottom: 0 }}>
              <label className="lbl">Ass. {i + 1}</label>
              <input className="inp" type="number" step={0.01} value={h}
                onChange={e => { const nh = [...data.grupo.hist]; nh[i] = +e.target.value; upd('grupo.hist', nh); }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepFormato({ data, upd }) {
  return (
    <div>
      <div className="sec-title">Indicadores & Formato</div>
      <div className="sec-sub">Configure o que aparece na proposta</div>
      <div className="card" style={{ marginBottom: 12 }}>
        {[
          { k: 'comparativo', l: 'Comparativo Consórcio × Financiamento', d: 'Tabela com parcelas e custo total vs CEF e banco' },
          { k: 'cet', l: 'CET — Custo Efetivo Total', d: 'Taxa real anual do consórcio vs financiamento' },
          { k: 'incc', l: 'Correção pelo INCC', d: 'Correção da carta e ganho real (imóvel)' },
          { k: 'ganhoVenda', l: 'Ganho com Venda da Carta', d: 'Estimativa de lucro com ágio de 12%' },
        ].map(({ k, l, d }) => (
          <div key={k} className="tog-row">
            <div><div className="tog-label">{l}</div><div className="tog-desc">{d}</div></div>
            <button className={`tog${data.opcoes[k] ? ' on' : ''}`} onClick={() => upd(`opcoes.${k}`, !data.opcoes[k])} />
          </div>
        ))}
      </div>
      <div className="sec-title" style={{ fontSize: 14, marginBottom: 4 }}>Formato da Proposta</div>
      <div className="sec-sub">Padrão e Simplificada cabem em 1 página impressa</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {TIPOS_PROP.map(t => (
          <div key={t.id} className={`card card-click${data.tipoProposta === t.id ? ' card-sel' : ''}`}
            style={{ padding: '11px 13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => upd('tipoProposta', t.id)}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{t.desc}</div>
            </div>
            <div style={{
              width: 15, height: 15, borderRadius: '50%',
              border: `2px solid ${data.tipoProposta === t.id ? 'var(--gold)' : 'rgba(255,255,255,.2)'}`,
              background: data.tipoProposta === t.id ? 'var(--gold)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, color: '#060A12', fontWeight: 700, flexShrink: 0
            }}>{data.tipoProposta === t.id ? '✓' : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── VIEWER ───────────────────────────────────────────────────────────────────────
function ViewerView({ code, onCode, onSearch, proposal, onCopy }) {
  if (proposal) return <ProposalView proposal={proposal} onCopy={onCopy} />;
  return (
    <div>
      <div className="pg-title" style={{ marginBottom: 5 }}>Acessar Proposta</div>
      <div className="pg-sub" style={{ marginBottom: 20 }}>Digite o código recebido pelo consultor</div>
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Código da Proposta</div>
        <input className="vc-inp" value={code} onChange={e => onCode(e.target.value.toUpperCase())}
          placeholder="MB-XXXXXX" onKeyDown={e => e.key === 'Enter' && onSearch()} />
        <button className="btn btn-gold btn-full" onClick={onSearch} disabled={code.length < 6}>Visualizar</button>
      </div>
    </div>
  );
}

// ─── PROPOSAL VIEW ────────────────────────────────────────────────────────────────
function ProposalView({ proposal: p, onCopy }) {
  const sim = useMemo(() => calcSim(p.grupo), [p]);
  const isImovel = p.produto.tipo === 'imovel';
  const hasCitybens = !!p.citybens;

  const Disc = () => (
    <div className="disc">
      <strong style={{ color: 'rgba(255,255,255,.5)' }}>⚠ Simulação informativa.</strong> Os valores são estimativos e não configuram compromisso ou garantia de contemplação. Contemplações ocorrem por sorteio ou lance, conforme regulamento do grupo.{' '}
      Código: <strong style={{ color: 'var(--gold)' }}>{p.id}</strong>
    </div>
  );

  const ShareBox = () => (
    <div className="card no-print" style={{ marginTop: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.7px' }}>Código de acesso</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, marginTop: 2 }}>{p.id}</div>
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => onCopy && onCopy(p.id)}>📋 Copiar</button>
        <button className="btn btn-gold btn-sm" onClick={() => window.print()}>🖨 PDF</button>
      </div>
    </div>
  );

  const CitybensSection = () => {
    if (!hasCitybens || !p.citybens?.grupos?.length) return null;
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
          <span className="cb-badge">📎 Citybens — {p.citybens.segmento}</span>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{p.citybens.grupos.length} cota{p.citybens.grupos.length > 1 ? 's' : ''}</span>
        </div>
        {p.citybens.grupos.length > 1 && (
          <div className="card" style={{ marginBottom: 8, padding: '12px' }}>
            <div className="met-lbl" style={{ marginBottom: 6 }}>Cotas Estruturadas</div>
            <table className="grupos-table">
              <thead><tr><th>Grupo</th><th>Prazo</th><th>Crédito</th><th>Parcela</th><th>Lance</th><th>Pós lance</th></tr></thead>
              <tbody>{p.citybens.grupos.map((g, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--gold)', fontWeight: 600 }}>{g.numero}</td>
                  <td>{g.prazo}m</td>
                  <td>{R(g.credito)}</td>
                  <td>{R(g.parcela_inicial)}</td>
                  <td>{Pt(g.lance_pct)}</td>
                  <td style={{ color: 'var(--green)' }}>{R(g.parcela_apos)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  if (p.tipoProposta === 'simplificada') return <SimplesView p={p} sim={sim} CitybensSection={CitybensSection} Disc={Disc} ShareBox={ShareBox} />;
  if (p.tipoProposta === 'padrao') return <PadraoView p={p} sim={sim} isImovel={isImovel} CitybensSection={CitybensSection} Disc={Disc} ShareBox={ShareBox} />;
  return <AnaliticaView p={p} sim={sim} isImovel={isImovel} CitybensSection={CitybensSection} Disc={Disc} ShareBox={ShareBox} />;
}

function PHeader({ p, sim }) {
  const g = p.grupo;
  return (
    <div className="ph">
      <div className="ph-eye">Simulação · {PRODUTOS[p.produto.tipo]?.label || 'Consórcio'} · {p.produto.subtipo}</div>
      <div className="ph-name">Crédito Patrimonial Programado — <span style={{ color: 'var(--gold)' }}>{R(g.credito)}</span></div>
      <div className="ph-sub">Para: <strong style={{ color: 'var(--text)' }}>{p.cliente.nome}</strong> · {g.nome} · {fmt(p.createdAt)}</div>
      <div className="ph-row">
        <span className="badge bg-gold">{Pt(g.taxa)} a.a.</span>
        <span className="badge bg-blue">{g.prazo} meses</span>
        <span className="badge bg-green">Lance {Pt(g.lancePct)}</span>
        <span className="badge" style={{ background: `rgba(${sim.prob >= 75 ? '52,211,153' : sim.prob >= 50 ? '201,168,76' : '248,113,113'},.15)`, color: sim.probColor }}>{sim.prob}% contemplação</span>
      </div>
    </div>
  );
}

function ConsultorCard() {
  return (
    <div className="consultor-card" style={{ marginTop: 14 }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 3 }}>Consultor responsável</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Valério Rodrigues</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>My Broker · Alpha Norte Gestão</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <a href="tel:+5534997779798" style={{ fontSize: 11, color: 'var(--gold)', textDecoration: 'none' }}>📞 (34) 9.9777-9798</a>
        <a href="tel:+5534998689798" style={{ fontSize: 11, color: 'var(--gold)', textDecoration: 'none' }}>📱 (34) 9.9868-9798</a>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>✉ valerio.rodrigues@alphanortegestao.com.br</span>
      </div>
    </div>
  );
}

function ComparativoCard({ sim }) {
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <table className="tbl">
        <thead><tr><th>Modalidade</th><th>Parcela</th><th>Total pago</th></tr></thead>
        <tbody>
          <tr><td><span className="c-green">●</span> Consórcio <span className="badge bg-green">MELHOR</span></td><td className="c-green">{R(sim.pl)}</td><td className="c-green">{R(sim.tl)}</td></tr>
          <tr><td><span className="c-gold">●</span> CEF <span style={{ fontSize: 9, color: 'var(--muted)' }}>12,5% a.a.</span></td><td className="c-gold">{R(sim.pmtCEF)}</td><td className="c-gold">{R(sim.ttCEF)}</td></tr>
          <tr><td><span className="c-red">●</span> Banco privado <span style={{ fontSize: 9, color: 'var(--muted)' }}>17,5% a.a.</span></td><td className="c-red">{R(sim.pmtBco)}</td><td className="c-red">{R(sim.ttBco)}</td></tr>
        </tbody>
      </table>
      <div className="g2" style={{ marginTop: 8 }}>
        <div style={{ background: 'rgba(52,211,153,.07)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 7, padding: '8px 10px' }}>
          <div className="met-lbl">Economia vs CEF</div>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{R(sim.ecCEF)}</div>
        </div>
        <div style={{ background: 'rgba(52,211,153,.07)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 7, padding: '8px 10px' }}>
          <div className="met-lbl">Economia vs banco</div>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{R(sim.ecBco)}</div>
        </div>
      </div>
    </div>
  );
}

function CETCards({ sim }) {
  return (
    <div className="g2" style={{ marginBottom: 8 }}>
      <div className="met green"><div className="met-lbl">CET Consórcio</div><div className="met-val">{Pt(sim.cet)} a.a.</div><div className="met-note">Custo efetivo total</div></div>
      <div className="met red"><div className="met-lbl">CET Banco privado</div><div className="met-val">17,5% a.a.</div><div className="met-note">Referência mercado</div></div>
    </div>
  );
}

function SimplesView({ p, sim, CitybensSection, Disc, ShareBox }) {
  return (
    <div>
      <PHeader p={p} sim={sim} />
      <CitybensSection />
      <div className="g2">
        <div className="met gold"><div className="met-lbl">Parcela com lance</div><div className="met-val">{R(p.citybens?.extraido?.totais?.parcela_apos_contemplacao || sim.pl)}</div><div className="met-note">Após contemplação</div></div>
        <div className="met"><div className="met-lbl">Lance</div><div className="met-val">{R(sim.lv)}</div><div className="met-note">{Pt(p.grupo.lancePct)} do crédito</div></div>
        <div className="met"><div className="met-lbl">Custo total</div><div className="met-val">{R(sim.tl)}</div><div className="met-note">Lance + parcelas</div></div>
        <div className="met green"><div className="met-lbl">Economia vs banco</div><div className="met-val">{R(sim.ecBco)}</div><div className="met-note">vs financiamento</div></div>
      </div>
      <div style={{ marginTop: 8, padding: '11px 13px', background: 'rgba(52,211,153,.07)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Financiamento bancário custaria</div>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>{R(sim.ttBco)}</div>
      </div>
      <ConsultorCard />
      <Disc /><ShareBox />
    </div>
  );
}

function PadraoView({ p, sim, isImovel, CitybensSection, Disc, ShareBox }) {
  const g = p.grupo;
  return (
    <div>
      <PHeader p={p} sim={sim} />
      <CitybensSection />
      <div className="g2" style={{ marginBottom: 8 }}>
        <div className="met gold"><div className="met-lbl">Parcela com lance</div><div className="met-val">{R(p.citybens?.extraido?.totais?.parcela_apos_contemplacao || sim.pl)}</div><div className="met-note">Após contemplação</div></div>
        <div className="met"><div className="met-lbl">Parcela inicial</div><div className="met-val">{R(p.citybens?.extraido?.totais?.parcela_inicial || sim.ps)}</div><div className="met-note">Antes do lance</div></div>
        <div className="met"><div className="met-lbl">Lance {Pt(g.lancePct)}</div><div className="met-val">{R(sim.lv)}</div><div className="met-note">Antecipa contemplação</div></div>
        <div className="met green"><div className="met-lbl">Custo total</div><div className="met-val">{R(sim.tl)}</div><div className="met-note">Lance + parcelas</div></div>
      </div>
      {p.opcoes.comparativo && <ComparativoCard sim={sim} />}
      {p.opcoes.cet && <CETCards sim={sim} />}
      <ConsultorCard />
      <Disc /><ShareBox />
    </div>
  );
}

function AnaliticaView({ p, sim, isImovel, CitybensSection, Disc, ShareBox }) {
  const g = p.grupo;
  return (
    <div>
      <PHeader p={p} sim={sim} />
      <CitybensSection />
      <div className="sec-title" style={{ marginBottom: 7 }}>Estrutura do Crédito</div>
      <div className="g2" style={{ marginBottom: 8 }}>
        <div className="met gold"><div className="met-lbl">Parcela sem lance</div><div className="met-val">{R(p.citybens?.extraido?.totais?.parcela_inicial || sim.ps)}</div><div className="met-note">Até contemplação</div></div>
        <div className="met green"><div className="met-lbl">Parcela com lance</div><div className="met-val">{R(p.citybens?.extraido?.totais?.parcela_apos_contemplacao || sim.pl)}</div><div className="met-note">Após contemplação</div></div>
        <div className="met"><div className="met-lbl">Lance {Pt(g.lancePct)}</div><div className="met-val">{R(sim.lv)}</div><div className="met-note">Antecipa contemplação</div></div>
        <div className="met"><div className="met-lbl">Custo total</div><div className="met-val">{R(sim.tl)}</div><div className="met-note">Lance + parcelas</div></div>
      </div>
      {p.opcoes.comparativo && <><div className="divhr" /><div className="sec-title" style={{ marginBottom: 7 }}>Comparativo: Consórcio × Financiamento</div><ComparativoCard sim={sim} /></>}
      {p.opcoes.cet && <><div className="divhr" /><div className="sec-title" style={{ marginBottom: 7 }}>Custo Efetivo Total (CET)</div><CETCards sim={sim} /></>}
      {p.opcoes.incc && isImovel && (
        <>
          <div className="divhr" />
          <div className="sec-title" style={{ marginBottom: 7 }}>Correção pelo INCC no Período</div>
          <div className="card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', marginBottom: 9 }}>
              <div style={{ flex: 1, background: 'rgba(201,168,76,.1)', padding: '9px', textAlign: 'center' }}>
                <div className="met-lbl">Carta hoje</div>
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 19, fontWeight: 700, color: 'var(--gold)' }}>{R(g.credito)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 16, color: 'var(--gold)' }}>→</div>
              <div style={{ flex: 1, background: 'rgba(52,211,153,.1)', padding: '9px', textAlign: 'center' }}>
                <div className="met-lbl">Em {g.prazo} meses</div>
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 19, fontWeight: 700, color: 'var(--green)' }}>{R(sim.cf)}</div>
              </div>
            </div>
            <div className="g2">
              <div className="met green"><div className="met-lbl">Ganho real</div><div className="met-val">{R(sim.inccGanho)}</div><div className="met-note">Correção acumulada</div></div>
              <div className="met gold"><div className="met-lbl">INCC médio ponderado</div><div className="met-val">5,8% a.a.</div><div className="met-note">{Pt(sim.inccPct, 1)} no período</div></div>
            </div>
            <div style={{ marginTop: 7, fontSize: 10, color: 'var(--muted)', padding: '6px 9px', background: 'rgba(255,255,255,.03)', borderRadius: 7 }}>
              💡 Seu crédito é corrigido pelo INCC, preservando o poder de compra enquanto o imóvel se valoriza.
            </div>
          </div>
        </>
      )}
      {p.opcoes.ganhoVenda && (
        <>
          <div className="divhr" />
          <div className="sec-title" style={{ marginBottom: 7 }}>Potencial de Ganho com Venda da Carta</div>
          <div className="card" style={{ marginBottom: 8 }}>
            <div className="g2" style={{ marginBottom: 8 }}>
              <div style={{ background: 'rgba(201,168,76,.07)', border: '1px solid rgba(201,168,76,.2)', borderRadius: 8, padding: '11px' }}>
                <div className="met-lbl">Valor de venda</div>
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>{R(sim.vv)}</div>
                <div className="met-note">Ágio médio 12%</div>
              </div>
              <div style={{ background: 'rgba(52,211,153,.07)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, padding: '11px' }}>
                <div className="met-lbl">Lucro estimado</div>
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{R(sim.gvenda)}</div>
                <div className="met-note">ROI: {Pt(sim.roi, 0)}</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', padding: '6px 9px', background: 'rgba(255,255,255,.03)', borderRadius: 7 }}>
              ⚡ Lance + 3 parcelas até venda. Ágio médio de mercado. Sujeito às condições no momento da negociação.
            </div>
          </div>
        </>
      )}
      <div className="divhr" />
      <div className="sec-title" style={{ marginBottom: 7 }}>Probabilidade de Contemplação</div>
      <div className="card" style={{ marginBottom: 8 }}>
        <div style={{ marginBottom: 7 }}>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${sim.prob}%`, background: `linear-gradient(90deg,${sim.probColor}55,${sim.probColor})` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>Lance {Pt(g.lancePct)} · Menor hist.: {Pt(sim.mh)}</span>
            <span style={{ fontSize: 15, fontFamily: 'Cormorant Garamond,serif', fontWeight: 700, color: sim.probColor }}>{sim.prob}%</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {g.hist.map((h, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '6px 3px', background: 'rgba(255,255,255,.04)', borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>Ass. {i + 1}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: g.lancePct >= h ? 'var(--green)' : 'var(--muted)' }}>{Pt(h)}</div>
            </div>
          ))}
        </div>
      </div>
      <ConsultorCard />
      <Disc /><ShareBox />
    </div>
  );
}
