import { useState, useEffect, useMemo } from 'react';
import { storage } from './storage.js';

const R  = v => v!=null?Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2}):'-';
const Pt = (v,d=1)=>`${Number(v).toFixed(d).replace('.',',')}%`;
const PMT = (pv,apr,n)=>{if(!pv||!n)return 0;const i=(1+apr/100)**(1/12)-1;if(i===0)return pv/n;return pv*(i*(1+i)**n)/((1+i)**n-1);};
const uid = ()=>'MB-'+Date.now().toString(36).toUpperCase().slice(-6);
const gid = ()=>Math.random().toString(36).slice(2,8).toUpperCase();
const fmt = ts=>new Date(ts).toLocaleDateString('pt-BR');

const PRODUTOS = {
  imovel:         {label:'Imóvel',            icon:'🏡',subtipos:['Aquisição','Construção','Aquisição e Construção','Reforma','Interveniente Quitante','Alavancagem Patrimonial']},
  veiculo_leve:   {label:'Veículo Leve',      icon:'🚗',subtipos:['Automóvel','SUV','Pickup Leve','Van']},
  veiculo_pesado: {label:'Veículo Pesado',    icon:'🚛',subtipos:['Caminhão','Ônibus','Implemento Rodoviário','Toco/Truck']},
  maquinas:       {label:'Máq. Agrícolas',    icon:'🚜',subtipos:['Trator','Colheitadeira','Implemento Agrícola','Irrigação','Pulverizador']},
  maquinas_ind:   {label:'Máquinas',          icon:'🏗️',subtipos:['Industrial','Construção Civil','Mineração','Energia','Portuária','Outros']},
  motocicleta:    {label:'Motocicleta',       icon:'🏍️',subtipos:['Urbana','Trail/Adventure','Esportiva','Elétrica']},
  servicos:       {label:'Serviços',          icon:'⚙️',subtipos:['Obras e Reformas','Tecnologia','Educação','Saúde','Energia Solar','Outros']},
};
const TIPOS_PROP=[
  {id:'simplificada',label:'Simplificada',desc:'Dados essenciais · 1 página'},
  {id:'padrao',      label:'Padrão',      desc:'Equilibrada · 1 página'},
  {id:'analitica',   label:'Analítica',   desc:'Completa com todos os indicadores'},
];
const newGrupo=()=>({_id:gid(),numero:'',prazo:84,credito:200000,parcela_inicial:0,lance_pct:25,parcela_apos:0,qtd_cotas:1});

function calcTotais(grupos,taxa,hist){
  const credito_total  =grupos.reduce((s,g)=>s+g.credito*g.qtd_cotas,0);
  const parcela_inicial=grupos.reduce((s,g)=>s+(g.parcela_inicial||PMT(g.credito,taxa,g.prazo))*g.qtd_cotas,0);
  const lance_total    =grupos.reduce((s,g)=>s+g.credito*g.lance_pct/100*g.qtd_cotas,0);
  const parcela_apos   =grupos.reduce((s,g)=>s+(g.parcela_apos||PMT(g.credito-g.credito*g.lance_pct/100,taxa,g.prazo))*g.qtd_cotas,0);
  const prazo_medio    =grupos.length?Math.round(grupos.reduce((s,g)=>s+g.prazo*g.qtd_cotas,0)/grupos.reduce((s,g)=>s+g.qtd_cotas,0)):84;
  const lance_pct_medio=credito_total>0?lance_total/credito_total*100:0;
  const custo_total    =lance_total+parcela_apos*prazo_medio;
  const anos=prazo_medio/12;
  const pmtCEF=PMT(credito_total,12.5,prazo_medio);const pmtBco=PMT(credito_total,17.5,prazo_medio);
  const ttCEF=pmtCEF*prazo_medio;const ttBco=pmtBco*prazo_medio;
  const ecCEF=ttCEF-custo_total;const ecBco=ttBco-custo_total;
  const cet=custo_total>0&&credito_total>0?((custo_total/credito_total)**(12/prazo_medio)-1)*100:0;
  const cf=credito_total*1.058**anos;const inccGanho=cf-credito_total;const inccPct=(1.058**anos-1)*100;
  const mh=hist?.length?Math.min(...hist):20;
  const prob=lance_pct_medio>=mh?95:lance_pct_medio>=mh*0.85?75:lance_pct_medio>=mh*0.7?50:20;
  const probColor=prob>=75?'#34D399':prob>=50?'#C9A84C':'#F87171';
  return{credito_total,parcela_inicial,lance_total,parcela_apos,prazo_medio,lance_pct_medio,custo_total,pmtCEF,pmtBco,ttCEF,ttBco,ecCEF,ecBco,cet,cf,inccGanho,inccPct,mh,prob,probColor,anos};
}

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#060A12;--card:#0F1928;--bo:rgba(201,168,76,.18);--bo2:rgba(255,255,255,.08);--gold:#C9A84C;--gold2:#E8C56E;--text:rgba(255,255,255,.92);--muted:rgba(255,255,255,.45);--dim:rgba(255,255,255,.22);--green:#34D399;--red:#F87171;--blue:#60A5FA;}
body{background:var(--bg);font-family:'DM Sans',sans-serif;color:var(--text);min-height:100vh}
.nav{background:rgba(13,21,37,.97);border-bottom:1px solid var(--bo);padding:0 14px;display:flex;align-items:center;justify-content:space-between;height:50px;position:sticky;top:0;z-index:50;backdrop-filter:blur(16px)}
.brand{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:700;color:var(--gold)}
.brand-sub{font-size:8px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase}
.main{max-width:600px;margin:0 auto;padding:18px 13px 80px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:9px 14px;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;font-family:'DM Sans',sans-serif;border:none;white-space:nowrap}
.btn-gold{background:linear-gradient(135deg,#C9A84C,#E8C56E);color:#060A12}.btn-gold:hover{transform:translateY(-1px);box-shadow:0 5px 16px rgba(201,168,76,.3)}
.btn-ghost{background:transparent;border:1px solid rgba(201,168,76,.3);color:var(--gold)}.btn-ghost:hover{background:rgba(201,168,76,.08)}
.btn-dim{background:rgba(255,255,255,.06);border:1px solid var(--bo2);color:var(--muted)}.btn-dim:hover{background:rgba(255,255,255,.1);color:var(--text)}
.btn-danger{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:var(--red)}
.btn-sm{padding:6px 11px;font-size:11px;border-radius:7px}.btn-full{width:100%}.btn:disabled{opacity:.3;cursor:not-allowed!important;transform:none!important}
.field{margin-bottom:11px}.lbl{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px;display:block}
.inp,.sel{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.11);border-radius:9px;padding:9px 11px;font-size:13px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;transition:border .2s;-webkit-appearance:none}
.inp:focus,.sel:focus{border-color:rgba(201,168,76,.5)}.inp-sm{padding:6px 9px;font-size:12px;border-radius:8px}
.sel option{background:#111827;color:var(--text)}
input[type=range]{width:100%;height:4px;appearance:none;background:rgba(255,255,255,.1);border-radius:2px;cursor:pointer;margin:7px 0}
input[type=range]::-webkit-slider-thumb{appearance:none;width:15px;height:15px;background:linear-gradient(135deg,var(--gold),var(--gold2));border-radius:50%}
.tog-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)}.tog-row:last-child{border-bottom:none;padding-bottom:0}
.tog-label{font-size:12px;font-weight:500}.tog-desc{font-size:10px;color:var(--muted);margin-top:1px}
.tog{width:36px;height:19px;background:rgba(255,255,255,.1);border-radius:10px;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0;border:none}
.tog.on{background:linear-gradient(135deg,var(--gold),var(--gold2))}.tog::after{content:'';position:absolute;top:2px;left:2px;width:15px;height:15px;background:#fff;border-radius:50%;transition:transform .2s}.tog.on::after{transform:translateX(17px)}
.card{background:var(--card);border:1px solid var(--bo);border-radius:13px;padding:14px}
.card-sel{border-color:var(--gold)!important;background:rgba(201,168,76,.06)!important}
.card-click{cursor:pointer;transition:all .2s}.card-click:hover:not(.card-sel){border-color:rgba(201,168,76,.3);transform:translateY(-1px)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}.g4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:7px}
.stpr{display:flex;align-items:center;justify-content:center;margin-bottom:18px}
.st-dot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0}
.st-dot.done{background:linear-gradient(135deg,var(--gold),var(--gold2));color:#060A12}.st-dot.active{background:rgba(201,168,76,.18);border:2px solid var(--gold);color:var(--gold)}.st-dot.idle{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:var(--dim)}
.st-line{width:22px;height:1px;background:rgba(255,255,255,.08)}.st-line.done{background:rgba(201,168,76,.4)}
.pg-title{font-family:'Cormorant Garamond',serif;font-size:clamp(21px,5vw,27px);font-weight:700;line-height:1.2}.pg-sub{font-size:11px;color:var(--muted);margin-top:4px}
.sec-title{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:700;margin-bottom:3px}.sec-sub{font-size:11px;color:var(--muted);margin-bottom:11px}
.divhr{height:1px;background:rgba(255,255,255,.06);margin:14px 0}
.met{background:var(--card);border:1px solid var(--bo);border-radius:11px;padding:11px}
.met-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:3px}
.met-val{font-family:'Cormorant Garamond',serif;font-size:clamp(15px,3.5vw,20px);font-weight:700;line-height:1.2}
.met-note{font-size:10px;color:var(--muted);margin-top:2px}
.gold .met-val{color:var(--gold)}.green .met-val{color:var(--green)}.red .met-val{color:var(--red)}
.tbl{width:100%;border-collapse:collapse}.tbl th{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:5px 0;text-align:left;border-bottom:1px solid rgba(255,255,255,.08);font-weight:500}
.tbl td{padding:7px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}.tbl td:last-child{text-align:right;font-weight:600}
.c-green{color:var(--green)}.c-gold{color:var(--gold)}.c-red{color:var(--red)}
.badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:9px;font-weight:700;letter-spacing:.4px}
.bg-gold{background:rgba(201,168,76,.15);color:var(--gold)}.bg-green{background:rgba(52,211,153,.15);color:var(--green)}.bg-red{background:rgba(248,113,113,.15);color:var(--red)}.bg-blue{background:rgba(96,165,250,.15);color:var(--blue)}
.ph{background:linear-gradient(135deg,#0D1525 0%,#0F1E35 100%);border:1px solid var(--bo);border-radius:14px;padding:20px;margin-bottom:10px;position:relative;overflow:hidden}
.ph::before{content:'';position:absolute;top:-40px;right:-40px;width:150px;height:150px;background:radial-gradient(circle,rgba(201,168,76,.09),transparent 70%);pointer-events:none}
.ph-eye{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:var(--gold);margin-bottom:6px;opacity:.7}
.ph-name{font-family:'Cormorant Garamond',serif;font-size:clamp(16px,4.5vw,22px);font-weight:700;line-height:1.2}
.ph-sub{font-size:11px;color:var(--muted);margin-top:4px}.ph-row{display:flex;align-items:center;gap:5px;margin-top:10px;flex-wrap:wrap}
.bar-track{height:6px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden}.bar-fill{height:100%;border-radius:4px;transition:width .6s}
.disc{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:8px 11px;font-size:10px;color:var(--muted);line-height:1.6;margin-top:10px}
.li{background:var(--card);border:1px solid var(--bo);border-radius:11px;padding:11px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:all .2s;margin-bottom:7px}.li:hover{border-color:rgba(201,168,76,.3);transform:translateY(-1px)}
.li-icon{width:38px;height:38px;border-radius:9px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.2);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
.li-info{flex:1;min-width:0}.li-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.li-meta{font-size:10px;color:var(--muted);margin-top:2px}
.li-val{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:700;color:var(--gold);text-align:right;flex-shrink:0}
.vc-inp{background:rgba(255,255,255,.07);border:2px solid rgba(201,168,76,.3);border-radius:11px;padding:12px 14px;font-size:17px;font-weight:700;font-family:'DM Sans',sans-serif;color:var(--text);text-align:center;letter-spacing:2px;outline:none;width:100%;margin:9px 0}.vc-inp:focus{border-color:var(--gold)}
.grupo-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.09);border-radius:11px;padding:13px;margin-bottom:9px}
.grupo-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}
.grupo-badge{background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.22);color:var(--gold);font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px}
.totals-box{background:linear-gradient(135deg,rgba(201,168,76,.08),rgba(201,168,76,.03));border:1px solid rgba(201,168,76,.2);border-radius:11px;padding:13px 14px;margin-top:8px}
.gtbl{width:100%;border-collapse:collapse;font-size:11px}
.gtbl th{font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);padding:5px 5px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-weight:500;white-space:nowrap}
.gtbl th:first-child{text-align:left}.gtbl td{padding:6px 5px;border-bottom:1px solid rgba(255,255,255,.04);text-align:right;white-space:nowrap}
.gtbl td:first-child{text-align:left;font-weight:600;color:var(--gold)}
.gtbl .tot-row td{border-top:1px solid rgba(201,168,76,.2);border-bottom:none;font-weight:700;color:var(--gold);padding-top:8px}
.consultor-card{background:var(--card);border:1px solid var(--bo);border-radius:11px;padding:13px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}
@media print{
  .nav,.btn,.disc,.no-print{display:none!important}
  body,html{background:#fff!important;color:#111!important}
  .ph{background:#f8f9fa!important;border-color:#e5e7eb!important}.ph-eye{color:#7c3aed!important}.ph-name{color:#111!important}.ph-sub{color:#777!important}
  .card,.met,.consultor-card,.totals-box{background:#fff!important;border-color:#e5e7eb!important}
  .gold .met-val{color:#92400e!important}.green .met-val{color:#047857!important}.red .met-val{color:#dc2626!important}
  .c-green{color:#047857!important}.c-gold{color:#92400e!important}.c-red{color:#dc2626!important}
  .gtbl th,.met-lbl,.met-note,.ph-sub{color:#777!important}.gtbl td{color:#111!important}.gtbl .tot-row td{color:#92400e!important}
  .gtbl td:first-child{color:#92400e!important}.badge.bg-green{background:#d1fae5!important;color:#047857!important}.badge.bg-gold{background:#fef3c7!important;color:#92400e!important}
  .divhr{background:#e5e7eb!important}
  @page{size:A4;margin:10mm}
}`;

export default function App() {
  const [view,setView]=useState('list');
  const [props,setProps]=useState([]);
  const [current,setCurrent]=useState(null);
  const [step,setStep]=useState(0);
  const [viewCode,setViewCode]=useState('');
  const [viewProp,setViewProp]=useState(null);
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState(null);
  const showToast=(msg,err=false)=>{setToast({msg,err});setTimeout(()=>setToast(null),3200);};

  useEffect(()=>{loadAll();},[]);
  async function loadAll(){
    try{
      const res=await storage.list('prop:');
      if(res?.keys?.length){
        const arr=await Promise.all(res.keys.map(async k=>{try{const r=await storage.get(k);return r?JSON.parse(r.value):null;}catch{return null;}}));
        setProps(arr.filter(Boolean).sort((a,b)=>b.createdAt-a.createdAt));
      }
    }catch{}
    setLoading(false);
  }
  async function saveProp(p){try{await storage.set(`prop:${p.id}`,JSON.stringify(p));}catch{}setProps(prev=>[p,...prev.filter(x=>x.id!==p.id)]);}
  async function delProp(id){try{await storage.delete(`prop:${id}`);}catch{}setProps(prev=>prev.filter(x=>x.id!==id));}
  function newProp(){
    setCurrent({id:uid(),createdAt:Date.now(),cliente:{nome:'',telefone:'',email:''},produto:{tipo:'',subtipo:''},
      meta:{administradora:'BB Consórcios',taxa:9.20,hist:[40,41,51]},grupos:[newGrupo()],
      opcoes:{comparativo:true,cet:true,incc:true,ganhoVenda:false},tipoProposta:'padrao'});
    setStep(0);setView('create');
  }
  async function handleViewCode(){
    try{const r=await storage.get(`prop:${viewCode.trim().toUpperCase()}`);if(r)setViewProp(JSON.parse(r.value));else showToast('Proposta não encontrada.',true);}
    catch{showToast('Erro ao buscar.',true);}
  }
  return(<>
    <style dangerouslySetInnerHTML={{__html:CSS}}/>
    {toast&&<div style={{position:'fixed',bottom:18,left:'50%',transform:'translateX(-50%)',background:toast.err?'rgba(248,113,113,.15)':'rgba(52,211,153,.15)',border:`1px solid ${toast.err?'rgba(248,113,113,.3)':'rgba(52,211,153,.3)'}`,color:toast.err?'#F87171':'#34D399',padding:'9px 18px',borderRadius:9,zIndex:200,fontSize:12,fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>{toast.msg}</div>}
    <nav className="nav">
      <div><div className="brand">My Broker</div><div className="brand-sub">Simulador de Propostas</div></div>
      <div style={{display:'flex',gap:5,alignItems:'center'}}>
        {view!=='list'&&<button className="btn btn-dim btn-sm" onClick={()=>{setView('list');setViewProp(null);}}>← Lista</button>}
        {view==='list'&&<><button className="btn btn-dim btn-sm" onClick={()=>{setView('viewer');setViewProp(null);}}>🔍 Ver Proposta</button><button className="btn btn-gold btn-sm" onClick={newProp}>+ Nova</button></>}
        {(view==='preview'||viewProp)&&<button className="btn btn-ghost btn-sm" onClick={()=>window.print()}>🖨 PDF</button>}
      </div>
    </nav>
    <div className="main">
      {view==='list'&&<ListView proposals={props} loading={loading} onNew={newProp} onOpen={p=>{setCurrent(p);setView('preview');}} onDelete={delProp}/>}
      {view==='create'&&current&&<CreateView data={current} step={step} onChange={setCurrent} onStep={setStep} onSave={async p=>{await saveProp(p);setCurrent(p);setView('preview');showToast('✓ Salvo! Código: '+p.id);}} onCancel={()=>setView('list')}/>}
      {view==='preview'&&current&&<ProposalView proposal={current} onCopy={id=>{navigator.clipboard?.writeText(id);showToast('Código '+id+' copiado!');}}/>}
      {view==='viewer'&&<ViewerView code={viewCode} onCode={setViewCode} onSearch={handleViewCode} proposal={viewProp} onCopy={id=>{navigator.clipboard?.writeText(id);showToast('Código copiado!');}}/>}
    </div>
  </>);
}

function ListView({proposals,loading,onNew,onOpen,onDelete}){
  if(loading)return<div style={{textAlign:'center',padding:50,color:'var(--muted)'}}>Carregando...</div>;
  const tot=proposals.reduce((s,p)=>{const g=p.grupos||[];return s+g.reduce((a,g)=>a+g.credito*g.qtd_cotas,0);},0);
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
      <div><div className="pg-title">Propostas</div><div className="pg-sub">{proposals.length} salva{proposals.length!==1?'s':''}{tot>0?' · '+R(tot)+' em créditos':''}</div></div>
    </div>
    {proposals.length===0?(<div style={{textAlign:'center',padding:'44px 16px'}}>
      <div style={{fontSize:42,marginBottom:12}}>📋</div>
      <div className="pg-title" style={{fontSize:19,marginBottom:5}}>Nenhuma proposta ainda</div>
      <div className="pg-sub" style={{marginBottom:20}}>Crie sua primeira proposta estruturada</div>
      <button className="btn btn-gold" onClick={onNew}>+ Criar Proposta</button>
    </div>):proposals.map(p=>{
      const gs=p.grupos||[];const ct=gs.reduce((s,g)=>s+g.credito*g.qtd_cotas,0);
      return(<div key={p.id} className="li" onClick={()=>onOpen(p)}>
        <div className="li-icon">{PRODUTOS[p.produto?.tipo]?.icon||'📄'}</div>
        <div className="li-info">
          <div className="li-name">{p.cliente.nome||'Cliente sem nome'}{gs.length>1&&<span className="badge bg-gold" style={{marginLeft:6}}>{gs.length} grupos</span>}</div>
          <div className="li-meta">{PRODUTOS[p.produto?.tipo]?.label||'—'} · {p.produto?.subtipo||'—'} · {p.id} · {fmt(p.createdAt)}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div className="li-val">{R(ct)}</div>
          <button className="btn btn-danger btn-sm" style={{marginTop:4,width:'100%'}} onClick={e=>{e.stopPropagation();if(window.confirm('Excluir?'))onDelete(p.id);}}>Excluir</button>
        </div>
      </div>);
    })}
  </div>);
}

function CreateView({data,step,onChange,onStep,onSave,onCancel}){
  const upd=(path,val)=>{const d=JSON.parse(JSON.stringify(data));const ks=path.split('.');let o=d;for(let i=0;i<ks.length-1;i++)o=o[ks[i]];o[ks[ks.length-1]]=val;onChange(d);};
  const canNext=[!!(data.cliente.nome),!!(data.produto.tipo&&data.produto.subtipo),!!(data.grupos?.length&&data.grupos[0].credito>0),true];
  const STEPS=['Cliente','Produto','Simulação','Formato'];
  return(<div>
    <div style={{marginBottom:16}}><div className="pg-title">Nova Proposta</div><div className="pg-sub">Código: <strong style={{color:'var(--gold)'}}>{data.id}</strong></div></div>
    <div className="stpr">{STEPS.map((s,i)=>(<div key={i} style={{display:'flex',alignItems:'center'}}><div className={`st-dot ${i<step?'done':i===step?'active':'idle'}`}>{i<step?'✓':i+1}</div>{i<STEPS.length-1&&<div className={`st-line ${i<step?'done':''}`}/>}</div>))}</div>
    {step===0&&<StepCliente data={data} upd={upd}/>}
    {step===1&&<StepProduto data={data} upd={upd} onChange={onChange}/>}
    {step===2&&<StepSimulacao data={data} onChange={onChange}/>}
    {step===3&&<StepFormato data={data} upd={upd}/>}
    <div style={{marginTop:18,display:'flex',flexDirection:'column',gap:7}}>
      <button className="btn btn-gold btn-full" disabled={!canNext[step]} onClick={()=>{if(step<3)onStep(step+1);else onSave(data);}}>{step<3?'Continuar →':'✓ Gerar Proposta'}</button>
      {step>0&&<button className="btn btn-dim btn-full" onClick={()=>onStep(step-1)}>← Voltar</button>}
      <button className="btn btn-dim btn-full" onClick={onCancel}>Cancelar</button>
    </div>
  </div>);
}

function StepCliente({data,upd}){return(<div>
  <div className="sec-title">Dados do Cliente</div><div className="sec-sub">Aparecem no cabeçalho da proposta</div>
  <div className="field"><label className="lbl">Nome completo *</label><input className="inp" value={data.cliente.nome} onChange={e=>upd('cliente.nome',e.target.value)} placeholder="Ex: João Carlos Pereira"/></div>
  <div className="g2">
    <div className="field"><label className="lbl">Telefone / WhatsApp</label><input className="inp" value={data.cliente.telefone} onChange={e=>upd('cliente.telefone',e.target.value)} placeholder="(34) 9.9999-9999"/></div>
    <div className="field"><label className="lbl">E-mail</label><input className="inp" value={data.cliente.email} onChange={e=>upd('cliente.email',e.target.value)} placeholder="email@email.com"/></div>
  </div>
</div>);}

function StepProduto({data,upd,onChange}){
  function selectTipo(k){
    const d=JSON.parse(JSON.stringify(data));
    d.produto.tipo=k;d.produto.subtipo='';
    onChange(d);
  }
  return(<div>
  <div className="sec-title">Produto</div><div className="sec-sub">Ramo e finalidade do crédito</div>
  <div className="g4" style={{marginBottom:12}}>{Object.entries(PRODUTOS).map(([k,v])=>(<div key={k} className={`card card-click${data.produto.tipo===k?' card-sel':''}`} style={{textAlign:'center',padding:'12px 6px'}} onClick={()=>selectTipo(k)}><div style={{fontSize:22,marginBottom:4}}>{v.icon}</div><div style={{fontSize:10,fontWeight:600,lineHeight:1.3}}>{v.label}</div></div>))}</div>
  {data.produto.tipo&&(<div className="field"><label className="lbl">Finalidade *</label><select className="sel" value={data.produto.subtipo} onChange={e=>upd('produto.subtipo',e.target.value)}><option value="">Selecione a finalidade...</option>{PRODUTOS[data.produto.tipo].subtipos.map(s=><option key={s} value={s}>{s}</option>)}</select></div>)}
</div>);}

function StepSimulacao({data,onChange}){
  const grupos=data.grupos||[];
  const meta=data.meta||{administradora:'',taxa:9.2,hist:[40,41,51]};
  const updMeta=(k,v)=>onChange({...data,meta:{...meta,[k]:v}});
  const updHist=(i,v)=>{const h=[...meta.hist];h[i]=v;onChange({...data,meta:{...meta,hist:h}});};
  const updGrupo=(idx,k,v)=>onChange({...data,grupos:grupos.map((g,i)=>i===idx?{...g,[k]:v}:g)});
  const addGrupo=()=>onChange({...data,grupos:[...grupos,newGrupo()]});
  const removeGrupo=idx=>{if(grupos.length===1)return;onChange({...data,grupos:grupos.filter((_,i)=>i!==idx)});};
  const dupGrupo=idx=>{const g={...grupos[idx],_id:gid()};const gs=[...grupos];gs.splice(idx+1,0,g);onChange({...data,grupos:gs});};
  const tot=calcTotais(grupos,meta.taxa,meta.hist);
  return(<div>
    <div className="sec-title">Dados da Simulação</div>
    <div className="sec-sub">Preencha os grupos de cotas — use o Claude para extrair valores de propostas Citybens</div>
    <div className="g2" style={{marginBottom:10}}>
      <div className="field" style={{marginBottom:0}}><label className="lbl">Administradora</label><input className="inp" value={meta.administradora} onChange={e=>updMeta('administradora',e.target.value)} placeholder="BB Consórcios"/></div>
      <div className="field" style={{marginBottom:0}}><label className="lbl">Taxa anual (%)</label><input className="inp" type="number" step={0.01} value={meta.taxa} onChange={e=>updMeta('taxa',+e.target.value)}/></div>
    </div>
    <div style={{marginBottom:14}}>
      <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',fontWeight:600,marginBottom:6}}>Histórico de Lances (últimas 3 assembleias)</div>
      <div className="g3">{meta.hist.map((h,i)=>(<div key={i}><label className="lbl">Assembleia {i+1}</label><input className="inp inp-sm" type="number" step={0.01} value={h} onChange={e=>updHist(i,+e.target.value)}/></div>))}</div>
    </div>
    <div className="divhr"/>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:11}}>
      <div><div style={{fontSize:14,fontWeight:700}}>Grupos / Cotas</div><div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>{grupos.length} grupo{grupos.length!==1?'s':''} · {grupos.reduce((s,g)=>s+g.qtd_cotas,0)} cotas · {R(tot.credito_total)}</div></div>
      <button className="btn btn-gold btn-sm" onClick={addGrupo}>+ Grupo</button>
    </div>
    {grupos.map((g,idx)=>(<div key={g._id} className="grupo-card">
      <div className="grupo-header">
        <span className="grupo-badge">Grupo {g.numero||idx+1}</span>
        <div style={{display:'flex',gap:5}}>
          <button className="btn btn-dim btn-sm" onClick={()=>dupGrupo(idx)} title="Duplicar">⧉ Duplicar</button>
          {grupos.length>1&&<button className="btn btn-danger btn-sm" onClick={()=>removeGrupo(idx)}>✕</button>}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:7,marginBottom:9}}>
        <div><label className="lbl">Nº Grupo</label><input className="inp inp-sm" value={g.numero} onChange={e=>updGrupo(idx,'numero',e.target.value)} placeholder="1465"/></div>
        <div><label className="lbl">Prazo (m)</label><input className="inp inp-sm" type="number" value={g.prazo} onChange={e=>updGrupo(idx,'prazo',+e.target.value)} min={12}/></div>
        <div><label className="lbl">Qtd. Cotas</label><input className="inp inp-sm" type="number" value={g.qtd_cotas} onChange={e=>updGrupo(idx,'qtd_cotas',Math.max(1,+e.target.value))} min={1}/></div>
        <div><label className="lbl">% Lance</label><input className="inp inp-sm" type="number" step={0.1} value={g.lance_pct} onChange={e=>updGrupo(idx,'lance_pct',+e.target.value)} min={0}/></div>
      </div>
      <div className="field" style={{marginBottom:9}}>
        <label className="lbl">Crédito: {R(g.credito)}</label>
        <input type="range" min={30000} max={800000} step={5000} value={g.credito} onChange={e=>updGrupo(idx,'credito',+e.target.value)}/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--muted)'}}><span>{R(30000)}</span><span>{R(800000)}</span></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
        <div><label className="lbl">Parcela Inicial (R$)</label><input className="inp inp-sm" type="number" step={0.01} value={g.parcela_inicial||''} onChange={e=>updGrupo(idx,'parcela_inicial',+e.target.value)} placeholder="Calculado auto"/></div>
        <div><label className="lbl">Parcela Pós Lance (R$)</label><input className="inp inp-sm" type="number" step={0.01} value={g.parcela_apos||''} onChange={e=>updGrupo(idx,'parcela_apos',+e.target.value)} placeholder="Calculado auto"/></div>
      </div>
      <div style={{fontSize:9,color:'var(--dim)',marginTop:6}}>💡 Parcelas em branco são calculadas automaticamente pela taxa</div>
    </div>))}
    {grupos.length>1&&(<div className="totals-box">
      <div style={{fontSize:10,color:'var(--gold)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',marginBottom:9}}>Totais da Proposta</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        {[{l:'Crédito Total',v:R(tot.credito_total)},{l:'Lance Total',v:R(tot.lance_total)},{l:'Parcela Inicial',v:R(tot.parcela_inicial)},{l:'Parcela Pós Lance',v:R(tot.parcela_apos)}].map(({l,v})=>(<div key={l}><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px'}}>{l}</div><div style={{fontSize:14,fontWeight:700,fontFamily:'Cormorant Garamond,serif',color:'var(--gold)',marginTop:2}}>{v}</div></div>))}
      </div>
    </div>)}
  </div>);}

function StepFormato({data,upd}){return(<div>
  <div className="sec-title">Indicadores & Formato</div><div className="sec-sub">Configure o que aparece na proposta</div>
  <div className="card" style={{marginBottom:12}}>
    {[{k:'comparativo',l:'Comparativo Consórcio × Financiamento',d:'vs CEF 12,5% e banco privado 17,5%'},{k:'cet',l:'CET — Custo Efetivo Total',d:'Taxa real anual do consórcio'},{k:'incc',l:'Correção pelo INCC',d:'Ganho real da carta no período (imóvel)'},{k:'ganhoVenda',l:'Ganho com Venda da Carta',d:'Estimativa de lucro com ágio 12%'}].map(({k,l,d})=>(<div key={k} className="tog-row"><div><div className="tog-label">{l}</div><div className="tog-desc">{d}</div></div><button className={`tog${data.opcoes[k]?' on':''}`} onClick={()=>upd(`opcoes.${k}`,!data.opcoes[k])}/></div>))}
  </div>
  <div className="sec-title" style={{fontSize:14,marginBottom:4}}>Formato da Proposta</div>
  <div style={{display:'flex',flexDirection:'column',gap:6}}>
    {TIPOS_PROP.map(t=>(<div key={t.id} className={`card card-click${data.tipoProposta===t.id?' card-sel':''}`} style={{padding:'11px 13px',display:'flex',justifyContent:'space-between',alignItems:'center'}} onClick={()=>upd('tipoProposta',t.id)}><div><div style={{fontSize:13,fontWeight:600}}>{t.label}</div><div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>{t.desc}</div></div><div style={{width:15,height:15,borderRadius:'50%',border:`2px solid ${data.tipoProposta===t.id?'var(--gold)':'rgba(255,255,255,.2)'}`,background:data.tipoProposta===t.id?'var(--gold)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'#060A12',fontWeight:700,flexShrink:0}}>{data.tipoProposta===t.id?'✓':''}</div></div>))}
  </div>
</div>);}

function ViewerView({code,onCode,onSearch,proposal,onCopy}){
  if(proposal)return<ProposalView proposal={proposal} onCopy={onCopy}/>;
  return(<div>
    <div className="pg-title" style={{marginBottom:5}}>Acessar Proposta</div>
    <div className="pg-sub" style={{marginBottom:20}}>Digite o código recebido pelo consultor</div>
    <div className="card" style={{textAlign:'center'}}>
      <div style={{fontSize:11,color:'var(--muted)',marginBottom:2}}>Código da Proposta</div>
      <input className="vc-inp" value={code} onChange={e=>onCode(e.target.value.toUpperCase())} placeholder="MB-XXXXXX" onKeyDown={e=>e.key==='Enter'&&onSearch()}/>
      <button className="btn btn-gold btn-full" onClick={onSearch} disabled={code.length<6}>Visualizar</button>
    </div>
  </div>);
}

function ProposalView({proposal:p,onCopy}){
  const meta=p.meta||{administradora:p.grupo?.nome||'',taxa:p.grupo?.taxa||9.2,hist:p.grupo?.hist||[40,41,51]};
  const grupos=p.grupos||(p.grupo?[{_id:'x',numero:'',prazo:p.grupo.prazo,credito:p.grupo.credito,parcela_inicial:0,lance_pct:p.grupo.lancePct,parcela_apos:0,qtd_cotas:1}]:[]);
  const tot=useMemo(()=>calcTotais(grupos,meta.taxa,meta.hist),[grupos,meta.taxa,JSON.stringify(meta.hist)]);
  const isImovel=p.produto?.tipo==='imovel';
  const multi=grupos.length>1;
  const totalCotas=grupos.reduce((s,g)=>s+g.qtd_cotas,0);

  const ShareBox=()=>(<div className="card no-print" style={{marginTop:9,display:'flex',alignItems:'center',justifyContent:'space-between',gap:9,flexWrap:'wrap'}}><div><div style={{fontSize:8,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px'}}>Código de acesso</div><div style={{fontSize:17,fontWeight:700,color:'var(--gold)',letterSpacing:2,marginTop:2}}>{p.id}</div></div><div style={{display:'flex',gap:5}}><button className="btn btn-ghost btn-sm" onClick={()=>onCopy&&onCopy(p.id)}>📋 Copiar</button><button className="btn btn-gold btn-sm" onClick={()=>window.print()}>🖨 PDF</button></div></div>);
  const Disc=()=>(<div className="disc"><strong style={{color:'rgba(255,255,255,.5)'}}>⚠ Simulação informativa.</strong> Valores estimativos. Não configuram compromisso ou garantia de contemplação. Contemplações ocorrem por sorteio ou lance conforme regulamento de cada grupo. Código: <strong style={{color:'var(--gold)'}}>{p.id}</strong></div>);
  const ConsultorCard=()=>(<div className="consultor-card"><div style={{flex:1,minWidth:160}}><div style={{fontSize:8,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:3}}>Consultor responsável</div><div style={{fontSize:14,fontWeight:700}}>Valério Rodrigues</div><div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>My Broker · Alpha Norte Gestão</div></div><div style={{display:'flex',flexDirection:'column',gap:3}}><a href="tel:+5534997779798" style={{fontSize:11,color:'var(--gold)',textDecoration:'none'}}>📞 (34) 9.9777-9798</a><a href="tel:+5534998689798" style={{fontSize:11,color:'var(--gold)',textDecoration:'none'}}>📱 (34) 9.9868-9798</a><span style={{fontSize:10,color:'var(--muted)'}}>✉ valerio.rodrigues@alphanortegestao.com.br</span></div></div>);

  const Header=()=>(<div className="ph">
    <div className="ph-eye">Simulação · {PRODUTOS[p.produto?.tipo]?.label||'Consórcio'} · {p.produto?.subtipo}</div>
    <div className="ph-name">Crédito Patrimonial Programado — <span style={{color:'var(--gold)'}}>{R(tot.credito_total)}</span></div>
    <div className="ph-sub">Para: <strong style={{color:'var(--text)'}}>{p.cliente?.nome}</strong> · {meta.administradora} · {fmt(p.createdAt)}</div>
    <div className="ph-row">
      <span className="badge bg-gold">{Pt(meta.taxa)} a.a.</span>
      <span className="badge bg-blue">{tot.prazo_medio}m médio</span>
      <span className="badge bg-green">Lance {Pt(tot.lance_pct_medio)}</span>
      {multi&&<span className="badge bg-gold">{grupos.length} grupos · {totalCotas} cotas</span>}
      <span className="badge" style={{background:`rgba(${tot.prob>=75?'52,211,153':tot.prob>=50?'201,168,76':'248,113,113'},.15)`,color:tot.probColor}}>{tot.prob}% contemplação</span>
    </div>
  </div>);

  const GruposTable=()=>(<div className="card" style={{marginBottom:10,padding:'12px 10px',overflowX:'auto'}}>
    <div style={{fontSize:10,color:'var(--gold)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',marginBottom:8}}>Plano Estruturado — {totalCotas} Cotas</div>
    <table className="gtbl">
      <thead><tr><th style={{textAlign:'left'}}>Grupo</th><th>Prazo</th><th>Crédito</th><th>Parc. Inicial</th><th>% Lance</th><th>Pós Lance</th><th>Cotas</th></tr></thead>
      <tbody>
        {grupos.map((g,i)=>{const pi=g.parcela_inicial||PMT(g.credito,meta.taxa,g.prazo);const pa=g.parcela_apos||PMT(g.credito-g.credito*g.lance_pct/100,meta.taxa,g.prazo);return(<tr key={g._id||i}><td>{g.numero||`G${i+1}`}</td><td>{g.prazo}m</td><td>{R(g.credito)}</td><td>{R(pi)}</td><td style={{color:'var(--gold)'}}>{Pt(g.lance_pct)}</td><td style={{color:'var(--green)'}}>{R(pa)}</td><td>{g.qtd_cotas}</td></tr>);})}
        <tr className="tot-row"><td>TOTAL</td><td style={{color:'var(--muted)',fontWeight:400,fontSize:10}}>{tot.prazo_medio}m méd.</td><td>{R(tot.credito_total)}</td><td>{R(tot.parcela_inicial)}</td><td>{Pt(tot.lance_pct_medio)}</td><td>{R(tot.parcela_apos)}</td><td>{totalCotas}</td></tr>
      </tbody>
    </table>
  </div>);

  const Metricas=()=>(<div className="g2" style={{marginBottom:8}}>
    <div className="met gold"><div className="met-lbl">Parcela pós lance</div><div className="met-val">{R(tot.parcela_apos)}</div><div className="met-note">Após contemplação</div></div>
    <div className="met"><div className="met-lbl">Parcela inicial</div><div className="met-val">{R(tot.parcela_inicial)}</div><div className="met-note">Antes do lance</div></div>
    <div className="met"><div className="met-lbl">Lance total</div><div className="met-val">{R(tot.lance_total)}</div><div className="met-note">{Pt(tot.lance_pct_medio)} do crédito</div></div>
    <div className="met green"><div className="met-lbl">Custo total</div><div className="met-val">{R(tot.custo_total)}</div><div className="met-note">Lance + parcelas</div></div>
  </div>);

  const Comparativo=()=>(<div className="card" style={{marginBottom:8}}>
    <table className="tbl"><thead><tr><th>Modalidade</th><th>Parcela</th><th>Total pago</th></tr></thead>
    <tbody>
      <tr><td><span className="c-green">●</span> Consórcio <span className="badge bg-green">MELHOR</span></td><td className="c-green">{R(tot.parcela_apos)}</td><td className="c-green">{R(tot.custo_total)}</td></tr>
      <tr><td><span className="c-gold">●</span> CEF <span style={{fontSize:9,color:'var(--muted)'}}>12,5% a.a.</span></td><td className="c-gold">{R(tot.pmtCEF)}</td><td className="c-gold">{R(tot.ttCEF)}</td></tr>
      <tr><td><span className="c-red">●</span> Banco privado <span style={{fontSize:9,color:'var(--muted)'}}>17,5% a.a.</span></td><td className="c-red">{R(tot.pmtBco)}</td><td className="c-red">{R(tot.ttBco)}</td></tr>
    </tbody></table>
    <div className="g2" style={{marginTop:8}}>
      <div style={{background:'rgba(52,211,153,.07)',border:'1px solid rgba(52,211,153,.2)',borderRadius:7,padding:'8px 10px'}}><div className="met-lbl">Economia vs CEF</div><div style={{fontFamily:'Cormorant Garamond,serif',fontSize:16,fontWeight:700,color:'var(--green)'}}>{R(tot.ecCEF)}</div></div>
      <div style={{background:'rgba(52,211,153,.07)',border:'1px solid rgba(52,211,153,.2)',borderRadius:7,padding:'8px 10px'}}><div className="met-lbl">Economia vs banco</div><div style={{fontFamily:'Cormorant Garamond,serif',fontSize:16,fontWeight:700,color:'var(--green)'}}>{R(tot.ecBco)}</div></div>
    </div>
  </div>);

  if(p.tipoProposta==='simplificada')return(<div><Header/>{multi&&<GruposTable/>}<Metricas/><div style={{marginTop:8,padding:'11px 13px',background:'rgba(52,211,153,.07)',border:'1px solid rgba(52,211,153,.2)',borderRadius:9,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:7}}><div style={{fontSize:11,color:'var(--muted)'}}>Financiamento bancário custaria</div><div style={{fontFamily:'Cormorant Garamond,serif',fontSize:18,fontWeight:700,color:'var(--red)'}}>{R(tot.ttBco)}</div></div><ConsultorCard/><Disc/><ShareBox/></div>);
  if(p.tipoProposta==='padrao')return(<div><Header/>{multi&&<GruposTable/>}<Metricas/>{p.opcoes?.comparativo&&<Comparativo/>}{p.opcoes?.cet&&<div className="g2" style={{marginBottom:8}}><div className="met green"><div className="met-lbl">CET Consórcio</div><div className="met-val">{Pt(tot.cet)} a.a.</div><div className="met-note">Custo efetivo total</div></div><div className="met red"><div className="met-lbl">CET Banco privado</div><div className="met-val">17,5% a.a.</div><div className="met-note">Referência mercado</div></div></div>}<ConsultorCard/><Disc/><ShareBox/></div>);

  return(<div>
    <Header/>{multi&&<GruposTable/>}
    <div className="sec-title" style={{marginBottom:7}}>Estrutura do Crédito</div><Metricas/>
    {p.opcoes?.comparativo&&<><div className="divhr"/><div className="sec-title" style={{marginBottom:7}}>Comparativo: Consórcio × Financiamento</div><Comparativo/></>}
    {p.opcoes?.cet&&<><div className="divhr"/><div className="sec-title" style={{marginBottom:7}}>Custo Efetivo Total (CET)</div><div className="g2" style={{marginBottom:8}}><div className="met green"><div className="met-lbl">CET Consórcio</div><div className="met-val">{Pt(tot.cet)} a.a.</div></div><div className="met red"><div className="met-lbl">CET Banco privado</div><div className="met-val">17,5% a.a.</div></div></div></>}
    {p.opcoes?.incc&&isImovel&&<><div className="divhr"/><div className="sec-title" style={{marginBottom:7}}>Correção pelo INCC</div><div className="card" style={{marginBottom:8}}><div style={{display:'flex',gap:0,borderRadius:8,overflow:'hidden',marginBottom:9}}><div style={{flex:1,background:'rgba(201,168,76,.1)',padding:'9px',textAlign:'center'}}><div className="met-lbl">Carta hoje</div><div style={{fontFamily:'Cormorant Garamond,serif',fontSize:19,fontWeight:700,color:'var(--gold)'}}>{R(tot.credito_total)}</div></div><div style={{display:'flex',alignItems:'center',padding:'0 8px',fontSize:16,color:'var(--gold)'}}>→</div><div style={{flex:1,background:'rgba(52,211,153,.1)',padding:'9px',textAlign:'center'}}><div className="met-lbl">Em {tot.prazo_medio} meses</div><div style={{fontFamily:'Cormorant Garamond,serif',fontSize:19,fontWeight:700,color:'var(--green)'}}>{R(tot.cf)}</div></div></div><div className="g2"><div className="met green"><div className="met-lbl">Ganho real</div><div className="met-val">{R(tot.inccGanho)}</div></div><div className="met gold"><div className="met-lbl">INCC médio</div><div className="met-val">5,8% a.a.</div><div className="met-note">{Pt(tot.inccPct,1)} no período</div></div></div></div></>}
    {p.opcoes?.ganhoVenda&&<><div className="divhr"/><div className="sec-title" style={{marginBottom:7}}>Potencial com Venda da Carta</div><div className="card" style={{marginBottom:8}}><div className="g2"><div style={{background:'rgba(201,168,76,.07)',border:'1px solid rgba(201,168,76,.2)',borderRadius:8,padding:'11px'}}><div className="met-lbl">Valor de venda (ágio 12%)</div><div style={{fontFamily:'Cormorant Garamond,serif',fontSize:17,fontWeight:700,color:'var(--gold)'}}>{R(tot.credito_total*1.12)}</div></div><div style={{background:'rgba(52,211,153,.07)',border:'1px solid rgba(52,211,153,.2)',borderRadius:8,padding:'11px'}}><div className="met-lbl">Lucro estimado</div><div style={{fontFamily:'Cormorant Garamond,serif',fontSize:17,fontWeight:700,color:'var(--green)'}}>{R(tot.credito_total*1.12-(tot.lance_total+tot.parcela_apos*3))}</div></div></div></div></>}
    <div className="divhr"/>
    <div className="sec-title" style={{marginBottom:7}}>Probabilidade de Contemplação</div>
    <div className="card" style={{marginBottom:8}}>
      <div style={{marginBottom:7}}><div className="bar-track"><div className="bar-fill" style={{width:`${tot.prob}%`,background:`linear-gradient(90deg,${tot.probColor}55,${tot.probColor})`}}/></div><div style={{display:'flex',justifyContent:'space-between',marginTop:4}}><span style={{fontSize:10,color:'var(--muted)'}}>Lance médio {Pt(tot.lance_pct_medio)} · Menor histórico: {Pt(tot.mh)}</span><span style={{fontSize:15,fontFamily:'Cormorant Garamond,serif',fontWeight:700,color:tot.probColor}}>{tot.prob}%</span></div></div>
      <div style={{display:'flex',gap:4}}>{meta.hist.map((h,i)=>(<div key={i} style={{flex:1,textAlign:'center',padding:'6px 3px',background:'rgba(255,255,255,.04)',borderRadius:6}}><div style={{fontSize:9,color:'var(--muted)',marginBottom:2}}>Ass. {i+1}</div><div style={{fontSize:11,fontWeight:600,color:tot.lance_pct_medio>=h?'var(--green)':'var(--muted)'}}>{Pt(h)}</div></div>))}</div>
    </div>
    <ConsultorCard/><Disc/><ShareBox/>
  </div>);
}
