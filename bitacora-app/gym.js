/* Módulo Gym compartido: lo usan la Bitácora y la app Plan Gym + Running.
   Un cambio aquí se publica en las dos. */
window.GymModule={mount:function(root,opts){
  opts=opts||{};
  var COLL=opts.collection||'gym', LS='gym.';
  root.classList.add('gym');
  root.innerHTML='<div class="g-top"><div class="seg g-tabs" role="tablist" aria-label="Secciones del entreno">'+
    [['hoy','Hoy'],['cal','Calendario'],['plan','Plan'],['prog','Progreso']].map(function(t){return '<button type="button" data-gtab="'+t[0]+'">'+t[1]+'</button>';}).join('')+
    '</div><button type="button" class="icon-btn g-wake" aria-pressed="false" title="Evita que la pantalla se apague durante la sesión">Pantalla</button></div><main class="g-view"><div class="empty">Cargando el plan…</div></main>';
  var fx=document.createElement('div'); fx.className='gym gym-fx';
  fx.innerHTML='<div class="rest" hidden></div><div class="toast" role="status" hidden></div>';
  document.body.appendChild(fx);
  var restEl=fx.querySelector('.rest'), toastEl=fx.querySelector('.toast');
  var db=null, data=[], tab='hoy', selId=null, cicloSel=null, exSel=null;
  var drafts={}, chains={}, openEx={}, moving=false;
  var calY, calM, calDay=null, addTipo=null;
  var restDur=90, rest=null, restTimer=null, wakeLock=null, wakeOn=false;
  var view=root.querySelector('.g-view');
  var COL={fuerza:'var(--strength)',running:'var(--accent)',natacion:'var(--swim)',futbol:'var(--futbol)',otro:'var(--ink-muted)'};
  var LBL={fuerza:'Fuerza',running:'Running',natacion:'Natación',futbol:'Fútbol',otro:'Otro'};

  try{ var rd=+localStorage.getItem(LS+'restDur'); if(rd) restDur=rd; }catch(e){}
  try{ var lt0=localStorage.getItem(LS+'tab'); if(lt0) tab=lt0; }catch(e){}

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function num(v){ var n=parseFloat(String(v==null?'':v).replace(',','.')); return isNaN(n)?null:n; }
  function fk(n){ return (Math.round(n*10)/10).toString().replace('.',','); }
  function iso(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function todayISO(){ return iso(new Date()); }
  function pd(s){ var p=s.split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
  function fmtDate(s,long){ return pd(s).toLocaleDateString('es-ES', long?{weekday:'long',day:'numeric',month:'long'}:{weekday:'short',day:'numeric',month:'short'}); }
  function short(s){ var p=s.split('-'); return (+p[2])+'/'+(+p[1]); }
  function mmss(sec){ sec=Math.max(0,Math.round(sec)); return Math.floor(sec/60)+':'+('0'+(sec%60)).slice(-2); }
  function parseT(s){ if(!s) return null; s=String(s).trim(); var p=s.split(':'); if(p.length===2) return (+p[0])*60+(+p[1]); if(p.length===3) return (+p[0])*3600+(+p[1])*60+(+p[2]); var n=num(s); return n==null?null:n*60; }
  function isExtra(d){ return !!d.extra || d.tipo==='natacion' || d.tipo==='futbol' || d.tipo==='otro' || d.semana===0; }
  function sorted(){ return data.slice().sort(function(a,b){ return a.fecha<b.fecha?-1:a.fecha>b.fecha?1:(a.orden||0)-(b.orden||0); }); }
  function byId(id){ for(var i=0;i<data.length;i++) if(data[i].id===id) return data[i]; return null; }
  function serieTxt(s,u){ if(u==='s') return s.reps+'s'; var rr=(s.rir!=null&&s.rir!==''?' @'+s.rir:''); if(u==='reps') return s.reps+' reps'+rr; return fk(s.kg)+'×'+s.reps+rr; }
  function objReps(o){ var m=/×\s*(\d+)/.exec(o||''); return m?m[1]:''; }
  function objKg(o){ var m=/(\d+(?:[.,]\d+)?)\s*kg/i.exec(o||''); return m?num(m[1]):null; }

  var toastT=null;
  function toast(msg){ var t=toastEl; t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(function(){ t.hidden=true; },2200); }

  function save(id,patch){
    if(!db){ toast('Sin conexión al almacén. Reintenta en unos segundos.'); return Promise.resolve(); }
    var p=(chains[id]||Promise.resolve()).then(function(){ return db.collection(COLL).doc(id).update(patch); })
      .catch(function(err){ console.error(err); toast('No se guardó ('+(err&&err.code?err.code:'error')+'). Revisa la conexión.'); });
    chains[id]=p; return p;
  }

  function planSessions(){ return sorted().filter(function(d){ return !isExtra(d); }); }
  function focusSession(){
    if(selId){ var s=byId(selId); if(s) return s; }
    var t=todayISO(), ps=planSessions(), i;
    for(i=0;i<ps.length;i++) if(ps[i].fecha===t && !ps[i].hecho) return ps[i];
    for(i=0;i<ps.length;i++) if(ps[i].fecha===t) return ps[i];
    for(i=0;i<ps.length;i++) if(ps[i].fecha>=t && !ps[i].hecho) return ps[i];
    return ps[ps.length-1]||null;
  }
  function lastTime(name,sess){
    var best=null;
    data.forEach(function(d){
      if(d.id===sess.id || !d.ejercicios || d.fecha>sess.fecha) return;
      d.ejercicios.forEach(function(e){ if(e.n===name && e.series && e.series.length && (!best || d.fecha>best.fecha)) best={fecha:d.fecha,e:e}; });
    });
    return best;
  }
  function curIdx(s){ var ex=s.ejercicios||[]; for(var i=0;i<ex.length;i++) if((ex[i].series||[]).length<(ex[i].sets||3)) return i; return -1; }

  // ---------- HOY ----------
  function defaults(s,i){
    var e=s.ejercicios[i], lt=lastTime(e.n,s), ser=e.series||[];
    var kg = ser.length? ser[ser.length-1].kg : (objKg(e.obj)!=null? objKg(e.obj) : (lt? lt.e.series[lt.e.series.length-1].kg : ''));
    var reps = ser.length? ser[ser.length-1].reps : (objReps(e.obj) || (lt? lt.e.series[0].reps : ''));
    return {kg:kg===''?'':fk(kg), reps:String(reps), rir:''};
  }
  function draft(s,i){ var k=s.id+'|'+i; if(!drafts[k]) drafts[k]=defaults(s,i); return drafts[k]; }

  function renderHoy(){
    var s=focusSession();
    if(!s){ view.innerHTML='<div class="empty">No hay sesiones. Pide un plan por chat.</div>'; return; }
    var h='';
    var same=sorted().filter(function(d){ return d.fecha===s.fecha; });
    if(same.length>1){
      h+='<div class="day-chips">'+same.map(function(d){ return '<button data-sel="'+d.id+'" class="'+(d.id===s.id?'on':'')+'">'+esc(d.titulo)+(d.hecho?' ✓':'')+'</button>'; }).join('')+'</div>';
    }
    h+='<div class="hoy-head"><h2>'+esc(s.titulo)+'</h2><div class="f"><span>'+esc(fmtDate(s.fecha,true))+'</span><span>Semana '+s.semana+(s.etapa?' · '+esc(s.etapa):'')+'</span>'+(s.hecho?'<span style="color:var(--done);font-weight:600">Hecha</span>':'')+'<button class="linkish" data-move="1">Mover fecha</button></div>';
    if(moving) h+='<div class="move"><input type="date" id="movedate" value="'+s.fecha+'"><button class="btn sec" data-movesave="'+s.id+'" style="min-height:44px">Guardar</button></div>';
    h+='</div>';

    if(s.ejercicios && s.ejercicios.length){
      var ci=curIdx(s), ex=s.ejercicios;
      h+='<div class="tools"><span class="seg-l">Descanso</span><div class="seg">'+[60,90,120,180].map(function(v){return '<button data-rest="'+v+'" class="'+(v===restDur?'on':'')+'">'+(v<120?v+'s':(v/60)+'m')+'</button>';}).join('')+'</div></div>';
      if(ci>=0){
        var nx=ex[ci+1]?ex[ci+1].n:'fin de sesión';
        h+='<div class="now"><div class="a">'+esc(ex[ci].n)+'</div><div class="b">Serie '+((ex[ci].series||[]).length+1)+' de '+(ex[ci].sets||3)+' · después: '+esc(nx)+'</div></div>';
      } else h+='<div class="now fin"><div class="a">Todas las series registradas</div><div class="b">Pulsa «Terminar sesión».</div></div>';
      var op = openEx[s.id]!=null ? openEx[s.id] : ci;
      ex.forEach(function(e,i){
        var u=e.u||'kg', ser=e.series||[], sets=e.sets||3, isOpen=(i===op);
        h+='<div class="ej'+(i===ci?' cur':'')+(ser.length>=sets?' ok':'')+'">';
        h+='<button class="ej-head" data-open="'+i+'" aria-expanded="'+isOpen+'"><span class="nm"><span class="ej-n">'+esc(e.n)+'</span><span class="ej-o">'+esc(e.obj||'')+'</span></span><span class="cnt">'+ser.length+'/'+sets+'</span></button>';
        if(isOpen){
          var lt=lastTime(e.n,s), dr=draft(s,i), key=s.id+'|'+i;
          h+='<div class="ej-body">';
          h+='<div class="last">'+(lt?'Última vez ('+short(lt.fecha)+'): '+esc(lt.e.series.map(function(x){return serieTxt(x,u);}).join(', ')):'Sin registro previo')+'</div>';
          if(ser.length) h+='<div class="chips">'+ser.map(function(x,j){ return '<span class="chip">'+esc(serieTxt(x,u))+'<button aria-label="Borrar serie '+(j+1)+'" data-del="'+i+'|'+j+'">×</button></span>'; }).join('')+'</div>';
          h+='<div class="steps'+(u==='kg'?'':' one')+'">';
          if(u==='kg') h+=stepper(key,'kg','Kg',dr.kg,'decimal');
          h+=stepper(key,'reps',u==='s'?'Segundos':'Reps',dr.reps,'numeric');
          h+='</div>';
          if(u!=='s') h+='<div class="rir'+(dr.rir?'':' req')+'"><span>RIR (obligatorio)</span>'+['0','1','2','3','4+'].map(function(r){return '<button data-rir="'+key+'|'+r+'" class="'+(dr.rir===r?'on':'')+'">'+r+'</button>';}).join('')+'</div>';
          h+='<button class="btn full" data-add="'+i+'">Añadir serie '+(ser.length+1)+'</button>';
          h+='</div>';
        }
        h+='</div>';
      });
      h+='<button class="btn full done" data-done="'+s.id+'">'+(s.hecho?'Marcar como no hecha':'Terminar sesión')+'</button>';
    } else if(s.tipo==='running'){
      h+='<div class="now run" style="margin-top:12px"><div class="a">'+esc(s.foco||'')+'</div><div class="b">Plan: '+(s.km||'–')+' km</div></div>';
      h+='<div class="card"><ul class="contenido">'+(s.contenido||[]).map(function(c){return '<li>'+esc(c)+'</li>';}).join('')+'</ul></div>';
      var dk=drafts[s.id+'|run']||{};
      var kmv=dk.km!=null?dk.km:(s.km_real!=null?fk(s.km_real):''), tv=dk.t!=null?dk.t:(s.tiempo?mmss(s.tiempo):'');
      h+='<div class="card"><div class="grid2"><div class="field"><label for="runkm">Km reales</label><input id="runkm" data-k="'+s.id+'|run|km" inputmode="decimal" value="'+esc(kmv)+'" placeholder="'+(s.km||'')+'"></div><div class="field"><label for="runt">Tiempo (mm:ss)</label><input id="runt" data-k="'+s.id+'|run|t" inputmode="numeric" value="'+esc(tv)+'" placeholder="47:59"></div></div>';
      var k=num(kmv), t=parseT(tv);
      h+='<div class="ritmo">'+(k&&t?mmss(t/k)+' /km':'– /km')+'</div>';
      h+='<div class="field" style="margin-top:10px"><label for="runnota">Nota</label><input id="runnota" data-nota="'+s.id+'" value="'+esc(s.nota||'')+'"></div></div>';
      h+='<button class="btn full done" data-runsave="'+s.id+'">'+(s.hecho?'Guardar cambios':'Guardar y terminar')+'</button>';
    } else {
      h+='<div class="card" style="margin-top:12px"><ul class="contenido">'+(s.contenido||[]).map(function(c){return '<li>'+esc(c)+'</li>';}).join('')+'</ul></div>';
      h+='<button class="btn full done" data-done="'+s.id+'">'+(s.hecho?'Marcar como no hecha':'Terminar sesión')+'</button>';
    }

    var td=todayISO(), up=planSessions().filter(function(d){ return d.id!==s.id && d.fecha>=td && !d.hecho; }).slice(0,4);
    var pend=planSessions().filter(function(d){ return d.fecha<td && !d.hecho && d.id!==s.id; }).slice(-2);
    if(up.length||pend.length){
      h+='<div class="next"><h3>Otras sesiones</h3>';
      pend.concat(up).forEach(function(d){ h+='<div class="nx" role="button" tabindex="0" data-sel="'+d.id+'"><span><span class="dot" style="background:'+COL[d.tipo||'fuerza']+'"></span>'+esc(d.titulo)+(d.fecha<td?'<span class="miss">sin hacer</span>':'')+'</span><span class="d">'+esc(fmtDate(d.fecha))+'</span></div>'; });
      h+='</div>';
    }
    if(selId) h+='<p><button class="btn ghost" data-sel="">Volver a hoy</button></p>';
    view.innerHTML=h;
  }
  function stepper(key,f,label,val,mode){
    var id='st-'+key.replace(/[^a-z0-9]/gi,'_')+'-'+f;
    return '<div class="step"><label for="'+id+'">'+label+'</label><div class="stepper"><button data-step="'+key+'|'+f+'|-1" aria-label="Menos">−</button><input id="'+id+'" data-k="'+key+'|'+f+'" inputmode="'+mode+'" value="'+esc(val)+'"><button data-step="'+key+'|'+f+'|1" aria-label="Más">+</button></div></div>';
  }

  // ---------- CALENDARIO ----------
  function renderCal(){
    var t=todayISO();
    if(calY==null){ var d0=new Date(); calY=d0.getFullYear(); calM=d0.getMonth(); }
    if(!calDay) calDay=t;
    var first=new Date(calY,calM,1), start=new Date(first); start.setDate(1-((first.getDay()+6)%7));
    var byDay={}; data.forEach(function(d){ (byDay[d.fecha]=byDay[d.fecha]||[]).push(d); });
    var mName=first.toLocaleDateString('es-ES',{month:'long'}); mName=mName.charAt(0).toUpperCase()+mName.slice(1)+' '+calY;
    var h='<div class="cal-head"><h2>'+esc(mName)+'</h2><div class="nav"><button data-calnav="-1" aria-label="Mes anterior">‹</button><button data-calnav="0" aria-label="Hoy" style="font-size:.78rem;font-weight:600;padding:0 10px">Hoy</button><button data-calnav="1" aria-label="Mes siguiente">›</button></div></div>';
    h+='<div class="cal">'+['L','M','X','J','V','S','D'].map(function(x){return '<div class="dow">'+x+'</div>';}).join('');
    for(var i=0;i<42;i++){
      var d=new Date(start); d.setDate(start.getDate()+i); var k=iso(d);
      if(i>=35 && d.getMonth()!==calM) break;
      var ss=(byDay[k]||[]).slice().sort(function(a,b){return (a.orden||0)-(b.orden||0);});
      var cls='c'+(d.getMonth()!==calM?' out':'')+(k===t?' today':'')+(k===calDay?' sel':'');
      h+='<button class="'+cls+'" data-day="'+k+'" aria-label="'+esc(fmtDate(k,true))+(ss.length?', '+ss.length+' sesiones':'')+'"><span class="n">'+d.getDate()+'</span><span class="ds">'+ss.map(function(x){ var c=COL[x.tipo||'fuerza']; var miss=!x.hecho&&x.fecha<t&&!isExtra(x); return '<i class="'+(x.hecho?'':'p')+'" style="background:'+c+';color:'+(miss?'var(--danger)':c)+'"></i>'; }).join('')+'</span></button>';
    }
    h+='</div>';
    h+='<div class="legend"><span><span class="dot" style="background:var(--strength)"></span>Fuerza</span><span><span class="dot" style="background:var(--accent)"></span>Running</span><span><span class="dot" style="background:var(--swim)"></span>Natación</span><span><span class="dot" style="background:var(--futbol)"></span>Fútbol</span><span>Relleno = hecha · aro = pendiente</span></div>';

    var list=(byDay[calDay]||[]).slice().sort(function(a,b){return (a.orden||0)-(b.orden||0);});
    h+='<div class="day-list"><h3 style="font-size:.8rem;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px">'+esc(fmtDate(calDay,true))+'</h3>';
    if(!list.length) h+='<div class="empty" style="margin-bottom:10px">Día libre.</div>';
    list.forEach(function(d){
      var st=d.hecho?'<span class="st ok">Hecha</span>':(d.fecha<t&&!isExtra(d)?'<span class="st ko">Sin hacer</span>':'<span class="st">Pendiente</span>');
      h+='<div class="ses" role="button" tabindex="0" data-sel="'+d.id+'" style="--c:'+COL[d.tipo||'fuerza']+'"><div class="bd"><div class="tt">'+esc(d.titulo)+'</div><div class="ff">'+esc(d.foco||'')+(d.km?' · '+d.km+' km':'')+'</div></div>'+st+'</div>';
    });
    if(addTipo){
      h+='<div class="card" style="margin-top:6px"><h3>Añadir extra</h3><div class="tipos">'+['natacion','futbol','running','otro'].map(function(x){return '<button data-tipo="'+x+'" class="'+(addTipo===x?'on':'')+'">'+LBL[x]+'</button>';}).join('')+'</div>';
      if(addTipo==='running') h+='<div class="grid2" style="margin-bottom:10px"><div class="field"><label for="xkm">Km</label><input id="xkm" inputmode="decimal"></div><div class="field"><label for="xt">Tiempo (mm:ss)</label><input id="xt" inputmode="numeric" placeholder="30:00"></div></div>';
      h+='<div class="field"><label for="xnota">Detalle</label><input id="xnota" placeholder="'+(addTipo==='natacion'?'1.000 m crol':addTipo==='futbol'?'Partido 90 min':'Qué hiciste')+'"></div>';
      h+='<div class="grid2" style="margin-top:12px"><button class="btn ghost" data-addcancel="1">Cancelar</button><button class="btn" data-addsave="1">Guardar</button></div></div>';
    } else h+='<button class="btn full sec" data-addopen="1">+ Añadir extra este día</button>';
    h+='</div>';
    view.innerHTML=h;
  }
  function addExtra(){
    var tipo=addTipo, nota=(document.getElementById('xnota')||{}).value||'';
    var ref=null, ps=sorted(); ps.forEach(function(d){ if(d.fecha<=calDay) ref=d; }); if(!ref) ref=ps[0]||{ciclo:1,semana:0,orden:0,etapa:''};
    var doc={ciclo:ref.ciclo||1, semana:ref.semana||0, etapa:ref.etapa||'', extra:true, fecha:calDay, foco:'Actividad extra fuera del plan', hecho:calDay<=todayISO(),
      nota:nota, orden:(ref.orden||0)+0.5, tipo:tipo, titulo:tipo==='running'?'Running libre':LBL[tipo], contenido:nota?[nota]:[]};
    if(tipo==='running'){ var km=num(document.getElementById('xkm').value), tt=parseT(document.getElementById('xt').value); if(km) doc.km_real=km; if(km&&tt) doc.tiempo=Math.round(tt); }
    if(!db){ toast('Sin conexión al almacén.'); return; }
    db.collection(COLL).add(doc).then(function(){ toast('Extra guardado'); }).catch(function(e){ console.error(e); toast('No se guardó. Revisa la conexión.'); });
    addTipo=null; render();
  }

  // ---------- PLAN ----------
  function renderPlan(){
    var all=sorted(), ciclos={};
    all.forEach(function(d){ ciclos[d.ciclo||1]=1; });
    var cs=Object.keys(ciclos).map(Number).sort(function(a,b){return a-b;});
    var fs=focusSession(); if(cicloSel==null) cicloSel=fs?(fs.ciclo||1):cs[0];
    var list=all.filter(function(d){ return (d.ciclo||1)===cicloSel; });
    var plan=list.filter(function(d){return !isExtra(d);}), extra=list.filter(isExtra);
    var t=todayISO(), done=plan.filter(function(d){return d.hecho;}).length, venc=plan.filter(function(d){return d.fecha<=t;});
    var kmP=plan.reduce(function(a,d){return a+(d.km||0);},0), kmR=plan.reduce(function(a,d){return a+(d.km_real||0);},0);
    var cumpl=venc.length?Math.round(venc.filter(function(d){return d.hecho;}).length/venc.length*100):0;
    var pct=plan.length?Math.round(done/plan.length*100):0;
    var h='<div class="seg" style="margin-bottom:12px">'+cs.map(function(c){return '<button data-ciclo="'+c+'" class="'+(c===cicloSel?'on':'')+'">Ciclo '+c+'</button>';}).join('')+'</div>';
    h+='<div class="stats"><div class="stat"><div class="n">'+done+'/'+plan.length+'</div><div class="l">Sesiones plan</div></div><div class="stat"><div class="n">'+cumpl+'%</div><div class="l">Cumplimiento a hoy</div></div><div class="stat"><div class="n">'+fk(kmR)+'/'+fk(kmP)+'</div><div class="l">Km reales/plan</div></div><div class="stat"><div class="n">'+extra.filter(function(d){return d.hecho;}).length+'</div><div class="l">Extras</div></div></div>';
    h+='<div class="bar" aria-label="Progreso del ciclo '+pct+'%"><div class="bar-fill" style="width:'+pct+'%"></div></div>';
    var wk={}; list.forEach(function(d){ (wk[d.semana]=wk[d.semana]||[]).push(d); });
    Object.keys(wk).map(Number).sort(function(a,b){return a-b;}).forEach(function(w){
      var ss=wk[w], cur=ss.some(function(d){return d.fecha===t;}) || (ss[0].fecha<=t && ss[ss.length-1].fecha>=t);
      h+='<div class="week"'+(cur?' id="curweek"':'')+'><h2>'+(w===0?'Semana previa':'Semana '+w)+' <span class="rango">'+esc(short(ss[0].fecha))+' – '+esc(short(ss[ss.length-1].fecha))+'</span><span class="tag">'+esc(ss[0].etapa||'')+'</span></h2>';
      ss.forEach(function(d){
        var tp=d.tipo||'fuerza';
        h+='<div class="sesion'+(d.hecho?' done':'')+(d.fecha===t?' hoy':'')+'" style="--c:'+COL[tp]+'"><div class="sesion-top">';
        h+='<input type="checkbox" class="check" id="chk-'+d.id+'" data-chk="'+d.id+'"'+(d.hecho?' checked':'')+' aria-label="Hecha: '+esc(d.titulo)+'">';
        h+='<div class="body"><div class="fecha">'+esc(fmtDate(d.fecha))+(!d.hecho&&d.fecha<t&&!isExtra(d)?'<span class="miss">sin hacer</span>':'')+'</div>';
        h+='<div class="titulo">'+esc(d.titulo)+'</div><div class="foco">'+esc(d.foco||'')+'</div>';
        h+='<div class="row-act"><span class="pill '+esc(tp)+'">'+LBL[tp]+'</span>'+(isExtra(d)?'':'<button class="reg" data-sel="'+d.id+'">Abrir</button>')+'</div>';
        var items = d.ejercicios&&d.ejercicios.length ? d.ejercicios.map(function(e){ return esc(e.n)+' · '+esc(e.obj||'')+(e.series&&e.series.length?' — <b>'+esc(e.series.map(function(x){return serieTxt(x,e.u||'kg');}).join(', '))+'</b>':''); }) : (d.contenido||[]).map(esc);
        if(items.length) h+='<details><summary>Detalle ('+items.length+')</summary><ul class="contenido">'+items.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></details>';
        if(d.km_real) h+='<div class="kv"><span>Real <b>'+fk(d.km_real)+' km</b></span>'+(d.tiempo?'<span>Tiempo <b>'+mmss(d.tiempo)+'</b></span><span>Ritmo <b>'+mmss(d.tiempo/d.km_real)+'/km</b></span>':'')+'</div>';
        h+='<input class="nota" id="nota-'+d.id+'" data-nota="'+d.id+'" value="'+esc(d.nota||'')+'" placeholder="Nota" aria-label="Nota">';
        h+='</div></div></div>';
      });
      h+='</div>';
    });
    view.innerHTML=h;
  }

  // ---------- PROGRESO ----------
  function chart(pts,o){
    if(!pts.length) return '<div class="empty">Sin datos todavía. Registra desde «Hoy».</div>';
    var W=600,H=230,L=48,R=o.b?44:14,T=22,B=34, iw=W-L-R, ih=H-T-B;
    var vs=pts.map(function(p){return p.v;}), mn=Math.min.apply(null,vs), mx=Math.max.apply(null,vs);
    if(mn===mx){ mn-=1; mx+=1; } var pad=(mx-mn)*0.15; mn-=pad; mx+=pad;
    var bmx=o.b?(Math.max.apply(null,pts.map(function(p){return p.b||0;}))*1.1||1):1;
    var n=pts.length, xs=function(i){ return L+(n===1?iw/2:i*iw/(n-1)); };
    var ys=function(v){ var r=(v-mn)/(mx-mn); if(o.inv) r=1-r; return T+ih-r*ih; };
    var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(o.title)+'">';
    for(var g=0;g<=3;g++){ var gv=mn+(mx-mn)*g/3, gy=ys(gv); s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+gy+'" y2="'+gy+'" stroke="var(--border)"/><text x="'+(L-6)+'" y="'+(gy+4)+'" text-anchor="end" font-size="12" fill="var(--ink-muted)">'+esc(o.fmt(gv))+'</text>'; }
    if(o.b){ var bw=Math.max(6,Math.min(28,iw/n*0.5)); pts.forEach(function(p,i){ var bh=(p.b||0)/bmx*ih; s+='<rect x="'+(xs(i)-bw/2)+'" y="'+(T+ih-bh)+'" width="'+bw+'" height="'+bh+'" rx="3" fill="var(--surface-2)"/>'; });
      s+='<text x="'+(W-R+6)+'" y="'+(T+10)+'" font-size="12" fill="var(--ink-muted)">'+esc(o.bl)+'</text>'; }
    s+='<path d="'+pts.map(function(p,i){return (i?'L':'M')+xs(i)+' '+ys(p.v);}).join(' ')+'" fill="none" stroke="'+o.c+'" stroke-width="2.5" stroke-linejoin="round"/>';
    pts.forEach(function(p,i){ s+='<circle cx="'+xs(i)+'" cy="'+ys(p.v)+'" r="4.5" fill="'+o.c+'"/><text x="'+xs(i)+'" y="'+(ys(p.v)-10)+'" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">'+esc(o.fmt(p.v))+'</text><text x="'+xs(i)+'" y="'+(H-12)+'" text-anchor="middle" font-size="12" fill="var(--ink-muted)">'+esc(p.x)+'</text>'; });
    return s+'</svg>';
  }
  function renderProg(){
    var all=sorted(), names={}, order=[];
    all.forEach(function(d){ (d.ejercicios||[]).forEach(function(e){ if((e.u||'kg')==='kg' && e.series&&e.series.length && !names[e.n]){ names[e.n]=1; order.push(e.n);} }); });
    if(!exSel||!names[exSel]) exSel=order[0]||null;
    var h='<div class="card"><h3>Fuerza · carga máxima (barras: volumen)</h3>';
    if(order.length){
      h+='<select id="exsel" aria-label="Ejercicio">'+order.map(function(n){return '<option'+(n===exSel?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</select>';
      var pts=[], best=null;
      all.forEach(function(d){ (d.ejercicios||[]).forEach(function(e){ if(e.n!==exSel||!e.series||!e.series.length) return;
        var mxk=0, vol=0; e.series.forEach(function(x){ mxk=Math.max(mxk,x.kg||0); vol+=(x.kg||0)*(x.reps||0); var e1=(x.kg||0)*(1+(x.reps||0)/30); if(!best||e1>best.e1) best={e1:e1,s:x,f:d.fecha}; });
        pts.push({x:short(d.fecha),v:mxk,b:vol}); }); });
      h+='<div class="chart">'+chart(pts,{title:'Carga máxima',c:'var(--strength)',fmt:function(v){return fk(v)+'kg';},b:true,bl:'vol.'})+'</div>';
      if(best) h+='<div class="kv"><span>Mejor serie <b>'+fk(best.s.kg)+'×'+best.s.reps+'</b> ('+short(best.f)+')</span><span>1RM est. <b>'+fk(best.e1)+' kg</b></span><span>Sesiones <b>'+pts.length+'</b></span></div>';
    } else h+='<div class="empty">Sin series registradas.</div>';
    h+='</div>';
    var runs=all.filter(function(d){return d.tipo==='running'&&d.km_real;});
    var isSeries=function(d){ return !d.extra && /series|interval/i.test((d.titulo||'')+' '+(d.foco||'')); };
    var sr=runs.filter(function(d){ return d.tiempo && isSeries(d); });
    h+='<div class="card"><h3>Running · ritmo medio en días de series (barras: km)</h3>';
    var rp=sr.map(function(d){return {x:short(d.fecha),v:d.tiempo/d.km_real,b:d.km_real};});
    h+='<div class="chart">'+(rp.length?chart(rp,{title:'Ritmo en series',c:'var(--accent)',fmt:mmss,inv:true,b:true,bl:'km'}):'<div class="empty">Sin sesiones de series registradas. Guarda km y tiempo desde «Hoy».</div>')+'</div>';
    if(sr.length){ var bs=sr.reduce(function(a,d){ return !a||d.tiempo/d.km_real<a.tiempo/a.km_real?d:a; },null);
      h+='<div class="kv"><span>Mejor ritmo <b>'+mmss(bs.tiempo/bs.km_real)+'/km</b> ('+short(bs.fecha)+')</span><span>Sesiones <b>'+sr.length+'</b></span></div>'; }
    h+='<p class="kv" style="margin-top:8px">Las tiradas suaves no cuentan aquí: van a ritmo conversacional.</p></div>';
    var wk={}; runs.forEach(function(d){ var k='S'+d.semana; wk[k]=(wk[k]||0)+d.km_real; });
    h+='<div class="card"><h3>Running · km por semana (todas las salidas)</h3><div class="kv" style="margin-top:0">'+Object.keys(wk).map(function(k){return '<span>'+k+' <b>'+fk(wk[k])+' km</b></span>';}).join('')+'<span>Total <b>'+fk(runs.reduce(function(a,d){return a+d.km_real;},0))+' km</b></span></div></div>';
    view.innerHTML=h;
  }

  function render(){
    if(!data.length){ view.innerHTML='<div class="empty">Cargando el plan…</div>'; return; }
    var ae=document.activeElement, fid=ae&&ae.id&&view.contains(ae)?ae.id:null, sel=null;
    try{ sel=ae&&ae.selectionStart; }catch(e){}
    if(tab==='hoy') renderHoy(); else if(tab==='cal') renderCal(); else if(tab==='plan') renderPlan(); else renderProg();
    if(fid){ var el=document.getElementById(fid); if(el){ el.focus({preventScroll:true}); try{ if(sel!=null) el.setSelectionRange(sel,sel);}catch(e){} } }
  }
  function setTab(t){
    tab=t; try{ localStorage.setItem(LS+'tab',t); }catch(e){}
    root.querySelectorAll('[data-gtab]').forEach(function(x){ var on=x.getAttribute('data-gtab')===t; x.classList.toggle('on',on); x.setAttribute('aria-selected',on?'true':'false'); });
    render(); if(!opts.noScroll) window.scrollTo(0,0);
    if(t==='plan'){ var cw=document.getElementById('curweek'); if(cw) cw.scrollIntoView({block:'start'}); }
  }

  // ---------- temporizador ----------
  var actx=null;
  function beep(){ try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)(); [0,0.25].forEach(function(o){ var os=actx.createOscillator(), g=actx.createGain(); os.frequency.value=880; g.gain.value=0.15; os.connect(g); g.connect(actx.destination); os.start(actx.currentTime+o); os.stop(actx.currentTime+o+0.15); }); }catch(e){} }
  function startRest(label){
    rest={end:Date.now()+restDur*1000, dur:restDur, label:label, fin:false};
    try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==='suspended') actx.resume(); }catch(e){}
    clearInterval(restTimer); restTimer=setInterval(tickRest,250); drawRest();
  }
  function drawRest(){
    var el=restEl;
    if(!rest){ el.hidden=true; el.innerHTML=''; return; }
    el.hidden=false;
    el.innerHTML='<div class="box'+(rest.fin?' end':'')+'"><span class="t" id="rt"></span><span class="lbl">'+(rest.fin?'<b>A por la siguiente serie</b>':'<b>Descanso</b>')+'<span>'+esc(rest.label)+'</span></span>'+(rest.fin?'':'<button data-restplus="1">+15s</button>')+'<button data-restskip="1">'+(rest.fin?'OK':'Saltar')+'</button><span class="pbar" id="rp"></span></div>';
    tickRest(true);
  }
  function tickRest(noEnd){
    if(!rest) return;
    var left=(rest.end-Date.now())/1000, t=document.getElementById('rt'), p=document.getElementById('rp');
    if(t) t.textContent=mmss(Math.ceil(Math.max(0,left)));
    if(p) p.style.width=Math.max(0,Math.min(100,(1-left/rest.dur)*100))+'%';
    if(left<=0 && !rest.fin && noEnd!==true){
      rest.fin=true; beep(); try{ navigator.vibrate&&navigator.vibrate([200,100,200]); }catch(e){}
      clearInterval(restTimer); drawRest();
      setTimeout(function(){ if(rest&&rest.fin){ rest=null; drawRest(); } },6000);
    }
  }
  restEl.addEventListener('click',function(ev){
    var b=ev.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-restplus')){ rest.end+=15000; rest.dur+=15; tickRest(true); }
    if(b.hasAttribute('data-restskip')){ clearInterval(restTimer); rest=null; drawRest(); }
  });

  // ---------- pantalla encendida ----------
  var wakeBtn=root.querySelector('.g-wake');
  function reqWake(){
    if(!('wakeLock' in navigator)){ toast('Tu navegador no permite mantener la pantalla encendida.'); wakeOn=false; paintWake(); return; }
    navigator.wakeLock.request('screen').then(function(l){ wakeLock=l; l.addEventListener('release',function(){ wakeLock=null; }); paintWake(); })
      .catch(function(){ wakeOn=false; paintWake(); toast('No se pudo mantener la pantalla encendida aquí.'); });
  }
  function paintWake(){ wakeBtn.classList.toggle('on',wakeOn); wakeBtn.setAttribute('aria-pressed',wakeOn); wakeBtn.textContent=wakeOn?'Pantalla: fija':'Pantalla'; }
  wakeBtn.addEventListener('click',function(){ wakeOn=!wakeOn; if(wakeOn) reqWake(); else { try{ wakeLock&&wakeLock.release(); }catch(e){} wakeLock=null; paintWake(); } });
  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible'){ if(wakeOn&&!wakeLock) reqWake(); if(rest) tickRest(); } });

  // ---------- eventos ----------
  root.querySelector('.g-tabs').addEventListener('click',function(ev){
    var b=ev.target.closest('button[data-gtab]'); if(b) setTab(b.getAttribute('data-gtab'));
  });
  view.addEventListener('input',function(ev){
    var k=ev.target.getAttribute('data-k'); if(!k) return;
    var p=k.split('|');
    if(p[1]==='run'){ var dk=drafts[p[0]+'|run']=drafts[p[0]+'|run']||{}; dk[p[2]]=ev.target.value;
      var r=view.querySelector('.ritmo'), km=num(document.getElementById('runkm').value), t=parseT(document.getElementById('runt').value);
      if(r) r.textContent=(km&&t?mmss(t/km):'–')+' /km'; return; }
    var key=p[0]+'|'+p[1]; drafts[key]=drafts[key]||{}; drafts[key][p[2]]=ev.target.value;
  });
  view.addEventListener('change',function(ev){
    var t=ev.target;
    if(t.id==='exsel'){ exSel=t.value; render(); return; }
    var n=t.getAttribute('data-nota'); if(n){ var s=byId(n); if(s) s.nota=t.value; save(n,{nota:t.value}).then(function(){ toast('Nota guardada'); }); return; }
    var c=t.getAttribute('data-chk'); if(c){ var s2=byId(c); if(s2) s2.hecho=t.checked; save(c,{hecho:t.checked}); render(); }
  });
  view.addEventListener('keydown',function(ev){
    if((ev.key==='Enter'||ev.key===' ') && ev.target.matches('[role=button]')){ ev.preventDefault(); ev.target.click(); return; }
    if(ev.key!=='Enter') return; var k=ev.target.getAttribute('data-k'); if(!k||k.indexOf('|run|')>0) return;
    var b=view.querySelector('[data-add="'+k.split('|')[1]+'"]'); if(b) b.click();
  });
  view.addEventListener('click',function(ev){
    var b=ev.target.closest('button,[data-sel]'); if(!b) return;
    if(b.hasAttribute('data-sel')){ selId=b.getAttribute('data-sel')||null; moving=false; setTab('hoy'); return; }
    if(b.hasAttribute('data-ciclo')){ cicloSel=+b.getAttribute('data-ciclo'); render(); return; }
    if(b.hasAttribute('data-day')){ calDay=b.getAttribute('data-day'); var dd=pd(calDay); if(dd.getMonth()!==calM){ calY=dd.getFullYear(); calM=dd.getMonth(); } addTipo=null; render(); return; }
    if(b.hasAttribute('data-calnav')){ var v=+b.getAttribute('data-calnav'); if(v===0){ var n0=new Date(); calY=n0.getFullYear(); calM=n0.getMonth(); calDay=todayISO(); } else { calM+=v; if(calM<0){calM=11;calY--;} if(calM>11){calM=0;calY++;} } render(); return; }
    if(b.hasAttribute('data-addopen')){ addTipo='natacion'; render(); return; }
    if(b.hasAttribute('data-tipo')){ addTipo=b.getAttribute('data-tipo'); render(); return; }
    if(b.hasAttribute('data-addcancel')){ addTipo=null; render(); return; }
    if(b.hasAttribute('data-addsave')){ addExtra(); return; }
    if(b.hasAttribute('data-rest')){ restDur=+b.getAttribute('data-rest'); try{ localStorage.setItem(LS+'restDur',restDur); }catch(e){} render(); return; }
    var s=focusSession(); if(!s) return;
    if(b.hasAttribute('data-move')){ moving=!moving; render(); return; }
    if(b.hasAttribute('data-movesave')){ var nd=document.getElementById('movedate').value; if(nd){ s.fecha=nd; save(s.id,{fecha:nd}).then(function(){ toast('Sesión movida al '+short(nd)); }); selId=s.id; } moving=false; render(); return; }
    if(b.hasAttribute('data-open')){ var oi=+b.getAttribute('data-open'), cur=openEx[s.id]!=null?openEx[s.id]:curIdx(s); openEx[s.id]=(cur===oi?-2:oi); render(); return; }
    if(b.hasAttribute('data-step')){
      var q=b.getAttribute('data-step').split('|'), key=q[0]+'|'+q[1], f=q[2], dl=+q[3], dr=drafts[key]=drafts[key]||{};
      var inp=view.querySelector('[data-k="'+key+'|'+f+'"]'), cv=num(inp?inp.value:dr[f])||0;
      var step=f==='kg'?(cv<10?0.5:2.5):(f==='reps'&&(s.ejercicios[+q[1]].u==='s')?5:1);
      var nv=Math.max(0,Math.round((cv+dl*step)*10)/10); dr[f]=fk(nv); if(inp) inp.value=dr[f]; return;
    }
    if(b.hasAttribute('data-rir')){ var r=b.getAttribute('data-rir').split('|'), k2=r[0]+'|'+r[1], d2=drafts[k2]=drafts[k2]||{}; d2.rir=(d2.rir===r[2]?'':r[2]); render(); return; }
    if(b.hasAttribute('data-add')){
      var i=+b.getAttribute('data-add'), e=s.ejercicios[i], u=e.u||'kg', kk=s.id+'|'+i;
      var g=function(fld){ var el=view.querySelector('[data-k="'+kk+'|'+fld+'"]'); return el?el.value:''; };
      var reps=num(g('reps')), kg=u==='kg'?num(g('kg')):0, rir=(drafts[kk]||{}).rir||null;
      if(reps==null||(u==='kg'&&kg==null)){ toast(u==='kg'?'Pon kg y reps.':'Pon '+(u==='s'?'segundos':'reps')+'.'); return; }
      if(u!=='s'&&!rir){ toast('Marca el RIR de la serie. Sin RIR no se registra.'); var rb=view.querySelector('[data-rir^="'+kk+'|"]'); if(rb&&rb.parentNode){ rb.parentNode.classList.add('req','shake'); setTimeout(function(){ rb.parentNode.classList.remove('shake'); },500); } return; }
      var ex=JSON.parse(JSON.stringify(s.ejercicios)); ex[i].series=(ex[i].series||[]).concat([{kg:kg,reps:reps,rir:rir}]);
      s.ejercicios=ex; drafts[kk]={kg:u==='kg'?fk(kg):'',reps:String(reps),rir:''};
      var full=ex[i].series.length>=(ex[i].sets||3); delete openEx[s.id];
      save(s.id,{ejercicios:ex});
      var ci=curIdx(s);
      if(ci>=0) startRest(full?'Siguiente: '+ex[ci].n:e.n+' · serie '+(ex[i].series.length+1)+' de '+(ex[i].sets||3));
      render(); return;
    }
    if(b.hasAttribute('data-del')){
      var dq=b.getAttribute('data-del').split('|'), ex2=JSON.parse(JSON.stringify(s.ejercicios)); ex2[+dq[0]].series.splice(+dq[1],1);
      s.ejercicios=ex2; save(s.id,{ejercicios:ex2}); render(); return;
    }
    if(b.hasAttribute('data-done')){ s.hecho=!s.hecho; save(s.id,{hecho:s.hecho}); if(s.hecho){ rest=null; clearInterval(restTimer); drawRest(); toast('Sesión completada'); } render(); return; }
    if(b.hasAttribute('data-runsave')){
      var km=num(document.getElementById('runkm').value), tt=parseT(document.getElementById('runt').value);
      if(!km||!tt){ toast('Pon km y tiempo (mm:ss).'); return; }
      s.km_real=km; s.tiempo=Math.round(tt); s.hecho=true; delete drafts[s.id+'|run'];
      save(s.id,{km_real:km,tiempo:Math.round(tt),hecho:true}).then(function(){ toast('Salida guardada'); }); render(); return;
    }
  });

  setTab(['hoy','cal','plan','prog'].indexOf(tab)>=0?tab:'hoy');
  function attach(ns){
    if(!ns){ view.innerHTML='<div class="empty">No se pudo abrir el almacén de datos. Recarga la página.</div>'; return; }
    db=ns;
    var lastK='';
    db.collection(COLL).onSnapshot(function(snap){
      var nd=snap.docs.map(function(d){ var v=Object.assign({},d.data()||{}); v.id=d.id; return v; }), k=JSON.stringify(nd);
      if(k===lastK) return; lastK=k; data=nd;
      render();
      if(opts.onData) try{ opts.onData(data.slice()); }catch(e){ console.error(e); }
    },function(err){ console.error('db error',err); toast('Error leyendo el plan. Recarga.'); });
  }
  if(opts.db){ Promise.resolve(opts.db).then(attach); }
  else if(window.claude && window.claude.use){ window.claude.use('db').then(attach); }
  return {
    open:function(id){ selId=id||null; moving=false; setTab('hoy'); },
    setTab:setTab,
    toggleDone:function(id){ var s=byId(id); if(!s) return; s.hecho=!s.hecho; save(id,{hecho:s.hecho}); render(); },
    refresh:render
  };
}};
