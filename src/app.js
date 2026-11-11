window.CLabStart=function(D){
  'use strict';
  const E=window.CLabEngine;
  const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId=new Map(D.points.map(p=>[p.id,p])),byQuestion=new Map(D.questions.map(q=>[q.id,q]));
  const drill=window.CLabDrill,drillBank=new Map(D.drillQuestions.map(q=>[q.id,q]));
  const progressFiles=window.CLabProgress.create(D);
  const localProgress=window.CLabStorage.open(()=>window.localStorage,progressFiles.restore);
  const main=$('#main');let state=localProgress.load()??E.fresh(),cleanupLab=null,searchLimit=70,heroIndex=0,toastTimer;
  function save(){state.updatedAt=Date.now();if(!localProgress.save(state))updateStorage();}
  function updateStorage(){
    const storage=localProgress.available;
    $('#storage-status').innerHTML=`<span class="offline-dot"${storage?'':' style="background:var(--red)"'}></span> ${storage?'本机已保存':'需导出进度'}`;
    $('#storage-warning').hidden=storage;
    $('#storage-warning').textContent='当前浏览器无法持久保存进度。本次学习仍可继续，离开前请到「设置与备份」导出进度文件。';
  }
  function settingsApply(){document.documentElement.style.setProperty('--scale',state.settings.textSize);document.documentElement.classList.toggle('reduce-motion',state.settings.reduceMotion);}
  function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
  function closeNav(){document.body.classList.remove('nav-open');$('#nav-scrim').hidden=true;$('#sidebar').inert=matchMedia('(max-width:900px)').matches;}
  function route(){const hash=(location.hash||'#home').slice(1);const [name,query='']=hash.split('?');return {name,params:new URLSearchParams(query)};}
  function href(name,params={}){const q=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==null&&v!==''));return `#${name}${q.size?'?'+q:''}`;}
  function button(label,action,classes='secondary',extra=''){return `<button type="button" class="button ${classes}" data-action="${action}" ${extra}>${label}</button>`;}
  function chapterTitle(id){return D.chapters.find(c=>c.id===id)?.title.replace(/^\d+ /,'')||'';}
  function explanationMarkup(question) {
    if (question.sourceTable) {
      const point = byId.get(question.pointId ?? question.id);
      return `<div class="prose feedback-prose">${point.html}</div>`;
    }
    return `<p>${esc(question.explanation)}</p>`;
  }
  function evidenceTag(id){const s=E.getEvidence(state,id);return `<span class="status-tag ${s==='迁移通过'?'good':s==='待巩固'?'work':''}">${s}</span>`;}
  function stats(){const p=Object.values(state.points);return {practiced:p.length,independent:p.filter(x=>x.base).length,transfer:p.filter(x=>x.transfer&&!x.needsWork).length,due:p.filter(x=>x.due<=Date.now()).length};}
  function navigation(name){
    const group=name.startsWith('point-')||name.startsWith('chapter-')||name.startsWith('cluster-')?'knowledge':name.startsWith('lab-')?'labs':name==='quiz'?'home':name;
    document.querySelectorAll('[data-nav]').forEach(a=>{const active=a.dataset.nav===group;a.classList.toggle('active',active);active?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');});
    const selected=name.startsWith('point-')?byId.get(Number(name.slice(6)))?.chapter:name.startsWith('chapter-')?Number(name.slice(8)):Number(route().params.get('chapter'));
    $('#chapter-nav').innerHTML=D.chapters.map(c=>{const passed=c.pointIds.every(id=>state.points[id]?.transfer&&!state.points[id]?.needsWork);return `<a href="#chapter-${c.id}" class="${selected===c.id?'current':''}"><span>${String(c.id).padStart(2,'0')}</span><span>${esc(c.title.replace(/^\d+ /,''))}</span>${passed?'<span class="chapter-check" aria-label="迁移通过">✓</span>':''}</a>`;}).join('');
    $('#breadcrumb').textContent=`学习台 / ${{home:'今天',drill:'刷题',knowledge:'知识地图',labs:'自由实验',progress:'学习记录',quiz:'三题练习'}[group]||'知识地图'}`;
  }
  function home(){
    const s=stats(),resume=state.session&&state.session.index<state.session.queue.length;
    main.innerHTML=`${resume?`<div class="resume-banner"><span>上次那一轮，停在第 ${state.session.index+1} 题。可以从这里接着来。</span><a class="text-button" href="#quiz">继续</a></div>`:''}
      <section class="hero"><div><p class="eyebrow">不用一次学完。只向前一点。</p><h1>今天，<br>只做三题。</h1><p class="subline">先猜一猜，再动手验证。<br>把看懂的 C，变成自己会用的 C。</p><div class="button-row">${button(resume?'继续上次':'开始 3 题',resume?'resume':'start','primary')}<a class="button secondary" href="#drill">${state.drill ? "继续刷题" : "刷题"}</a><a class="text-button" href="#knowledge">自己选一章</a></div><p class="hero-note">约 2–5 分钟 · 没有倒计时 · 随时可以停</p></div>
      <div class="hero-workbench"><div class="workbench-label"><span>摸一下指针</span><span>一个可操作的小模型</span></div><pre><code>int a[4] = { 3, 1, 4, 2 };\nint *p = a;\np++;</code></pre><div id="hero-memory" class="hero-memory"></div><div class="hero-lab-actions"><button class="text-button" data-action="hero-back">退一步</button><button class="button secondary small" data-action="hero-next">p++ 前进一步</button></div><p id="hero-feedback" class="hero-feedback" aria-live="polite"></p></div></section>
      <section class="home-section"><div class="section-head"><h2>这一轮，很简单。</h2><small>${s.due?`${s.due} 个知识点到了复习时间`:'从一个小问题开始'}</small></div><div class="round-line"><div class="round-step"><span>1</span><div><strong>先做判断</strong><p>不用急着翻答案。</p></div></div><div class="round-step"><span>2</span><div><strong>看到原因</strong><p>错在哪里，具体说清楚。</p></div></div><div class="round-step"><span>3</span><div><strong>带走一点能力</strong><p>下次换个情境再验证。</p></div></div></div></section>
      <section class="home-section"><div class="section-head"><h2>或者，先动手。</h2><a class="text-button" href="#labs">全部实验</a></div><div class="topic-list"><a class="topic-link" href="#lab-pointers"><span>指针往前一步，究竟移动了什么？</span><small>指针工作台 ↗</small></a><a class="topic-link" href="#lab-resources"><span>释放以后，另一个指针还能用吗？</span><small>资源维修台 ↗</small></a><a class="topic-link" href="#lab-calls"><span>递归返回时，谁在等着谁？</span><small>调用栈 ↗</small></a></div></section>
      <div class="home-stats"><span><strong>${D.points.length}</strong>知识点</span><span><strong>${D.questions.length}</strong>专属练习</span><span><strong>${s.independent}</strong>独立通过</span><span><strong>${s.transfer}</strong>迁移通过</span></div>`;
    drawHero();
  }
  function drawHero(){
    const values=[3,1,4,2];$('#hero-memory').innerHTML=[...values,'尾后'].map((v,i)=>`<div class="hero-cell ${i===heroIndex?'selected':''} ${i===4?'end':''}">${v}<small>${i===4?'a + 4':`a[${i}]`}</small></div>`).join('');
    $('#hero-feedback').textContent=heroIndex===4?'p 可以位于尾后，但不能解引用。再执行 p++ 会越出允许范围。':`现在 p 指向 a[${heroIndex}]，*p 是 ${values[heroIndex]}。图中每格代表一个 int 对象，步长不固定为 1 字节。`;
  }
  function knowledge(params){
    const chapter=params.get('chapter')||'all',q=params.get('q')||'',filter=params.get('filter')||'all';
    main.innerHTML=`<div class="section-head"><div><h1>知识地图</h1><p>所有路径都开放。找到你现在需要的那一处。</p></div></div><div class="toolbar"><label class="search-wrap"><span class="sr-only">搜索知识点与代码</span><input id="knowledge-search" type="search" placeholder="搜索知识、代码或编号，如：realloc" value="${esc(q)}" autocomplete="off"></label><select id="chapter-filter" aria-label="按章节筛选"><option value="all">全部 19 章</option>${D.chapters.map(c=>`<option value="${c.id}" ${String(c.id)===chapter?'selected':''}>${esc(c.title)}</option>`).join('')}</select></div><div class="filter-chips" aria-label="按学习状态筛选">${[['all','全部'],['due','待复习'],['new','未练习'],['transfer','迁移通过']].map(([v,label])=>`<button class="chip ${filter===v?'active':''}" data-action="filter" data-filter="${v}" aria-pressed="${filter===v}">${label}</button>`).join('')}</div><div id="knowledge-results"></div>`;
    renderKnowledgeResults(chapter,q,filter);
    $('#knowledge-search').addEventListener('input',()=>{searchLimit=70;renderKnowledgeResults($('#chapter-filter').value,$('#knowledge-search').value,filter);});
    $('#chapter-filter').addEventListener('change',()=>{searchLimit=70;renderKnowledgeResults($('#chapter-filter').value,$('#knowledge-search').value,filter);});
  }
  function renderKnowledgeResults(chapter,q,filter){
    const term=q.trim().toLowerCase();let matches=D.points.filter(p=>(chapter==='all'||p.chapter===Number(chapter))&&(!term||p.search.includes(term))&&(filter==='all'||filter==='due'&&state.points[p.id]?.due<=Date.now()||filter==='new'&&!state.points[p.id]||filter==='transfer'&&state.points[p.id]?.transfer&&!state.points[p.id]?.needsWork));
    const shown=matches.slice(0,searchLimit),groups=new Map();for(const p of shown){if(!groups.has(p.cluster))groups.set(p.cluster,[]);groups.get(p.cluster).push(p);}
    $('#knowledge-results').innerHTML=`<p class="muted" style="font-size:11px;margin-bottom:16px">找到 ${matches.length} 个知识点${shown.length<matches.length?` · 已显示 ${shown.length} 个`:''}</p>${matches.length?[...groups].map(([id,ps])=>`<section class="cluster-group"><h2>${esc(D.clusters.find(c=>c.id===id)?.title||id)}</h2>${ps.map(p=>`<a href="#point-${p.id}" class="point-row"><span class="point-number">${String(p.id).padStart(3,'0')}</span><span class="point-title">${esc(p.title)}<small>${esc(chapterTitle(p.chapter))}</small></span>${evidenceTag(p.id)}</a>`).join('')}</section>`).join(''):`<div class="empty"><h2>这里暂时没有知识点。</h2><p>试试更短的关键词，或切换章节和筛选条件。</p></div>`}${shown.length<matches.length?button('再显示 70 个','more-points','secondary'):''}<details class="source-details"><summary>原文导航、代码索引与参考资料</summary><div class="prose">${D.extras.map(x=>`<h2>${esc(x.title)}</h2>${x.html}`).join('')}</div></details>`;
  }
  function chapterView(id){
    const c=D.chapters.find(c=>c.id===id);if(!c)return notFound();const ps=c.pointIds.map(id=>byId.get(id));
    main.innerHTML=`<div class="reading-head"><a class="text-button" href="#knowledge">全部知识</a><h1>${esc(c.title)}</h1><p class="subline">${ps.length} 个知识点 · ${ps.length*2} 道专属练习 · 全部可自由进入</p><div class="button-row" style="margin-top:24px">${button('这一章，做 3 题','start-chapter','primary',`data-chapter="${id}"`)}<a class="button secondary" href="#lab-${c.labId}">进入对应实验</a></div></div><div class="prose">${c.html}</div>${D.clusters.filter(x=>x.chapter===id).map(cluster=>`<section class="cluster-group" id="cluster-row-${cluster.id}"><h2>${esc(cluster.title)}</h2><details class="source-details"><summary>知识图与目录</summary><div class="prose">${cluster.html}</div></details>${ps.filter(p=>p.cluster===cluster.id).map(p=>`<a class="point-row" href="#point-${p.id}"><span class="point-number">${p.id}</span><span class="point-title">${esc(p.title)}</span>${evidenceTag(p.id)}</a>`).join('')}</section>`).join('')}`;
  }
  function pointView(id){
    const p=byId.get(id);if(!p)return notFound();state.lastPoint=id;save();
    main.innerHTML=`<div class="reading-head"><a class="text-button" href="#chapter-${p.chapter}">${esc(D.chapters.find(c=>c.id===p.chapter).title)}</a><h1>${esc(p.title)}</h1><p class="subline">知识点 ${p.id} · ${esc(D.clusters.find(c=>c.id===p.cluster)?.title||'')}</p></div><div class="reading-layout"><article class="prose">${p.html}</article><aside class="reading-aside">${evidenceTag(p.id)}${button('验证这个知识点','start-point','primary',`data-point="${p.id}"`)}<a class="button secondary" href="#lab-${D.chapters.find(c=>c.id===p.chapter).labId}">动手实验</a><p>阅读帮助理解；独立作答和隔日迁移，才积累掌握证据。</p></aside></div><nav class="reading-pagination" aria-label="相邻知识点">${id>1?`<a href="#point-${id-1}">← ${esc(byId.get(id-1).title)}</a>`:'<span></span>'}${id<D.points.length?`<a href="#point-${id+1}">${esc(byId.get(id+1).title)} →</a>`:''}</nav>`;
  }
  function startSession(options={}){
    const queue=E.queue(state,D.points,D.questions,options);if(!queue.length)return toast('题库还没有准备好。');
    state.session={queue,index:0,answers:[],current:{value:null,assisted:false,submitted:false,everWrong:false},scope:options,started:Date.now()};save();
    if(location.hash==='#quiz')render();else location.hash='quiz';
  }
  function quizInput(q,c){
    const disabled=c.submitted?'disabled':'';
    if(q.kind==='choice')return `<div class="choice-list" role="group" aria-label="选择答案">${q.options.map((option,i)=>`<button type="button" class="choice ${Number(c.value)===i&&c.value!==null?'selected':''} ${c.submitted?(i===Number(q.answer)?'correct':Number(c.value)===i?'wrong':''):''}" data-action="choose" data-index="${i}" aria-pressed="${c.value!==null&&Number(c.value)===i}" ${disabled}><span class="choice-key">${String.fromCharCode(65+i)}</span><span>${esc(option)}</span></button>`).join('')}</div>`;
    if(q.kind==='order'){
      const chosen=Array.isArray(c.value)?c.value:[];
      return `<div class="quiz-order"><p class="subline">依次点选，组成执行顺序。</p><ol class="chosen-sequence" aria-label="当前顺序">${chosen.map(i=>`<li><code>${esc(q.options[i])}</code></li>`).join('')}</ol>${!c.submitted?`<div class="choice-list" role="group" aria-label="可排列的步骤">${q.options.map((option,i)=>`<button type="button" class="choice" data-action="seq-add" data-index="${i}" ${chosen.includes(i)?'disabled':''}><code>${esc(option)}</code></button>`).join('')}</div><button class="text-button" data-action="seq-undo" type="button" ${chosen.length?'':'disabled'}>撤回上一步</button>`:''}</div>`;
    }
    if(q.kind==='match')return `<div class="quiz-match" role="group" aria-label="选择对应类型">${q.items.map((label,i)=>`<label class="match-row"><code>${esc(label)}</code><select data-match="${i}" ${disabled}><option value="">选择类型</option>${q.options.map((o,j)=>`<option value="${j}" ${c.value?.[i]===j?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`).join('')}</div>`;
    return `<label class="sr-only" for="answer-input">输入你的答案</label><textarea class="answer-input" id="answer-input" rows="2" spellcheck="false" autocomplete="off" placeholder="输入结果、类型或题目要求的短答案" ${disabled}>${esc(c.value||'')}</textarea><small style="display:block;margin-top:8px">按题目要求作答。Ctrl + Enter 提交。</small>`;
  }
  function quiz(){
    const s=state.session;if(!s){main.innerHTML=`<div class="empty"><h1>从三题开始。</h1><p style="margin:18px 0 24px">先预测，再验证。什么时候开始都可以。</p>${button('开始 3 题','start','primary')}</div>`;return;}
    if(s.index>=s.queue.length)return finishRound();
    const q=byQuestion.get(s.queue[s.index]);if(!q){state.session=null;save();return quiz();}
    s.current??={value:null,assisted:false,submitted:false,everWrong:false};const c=s.current,p=byId.get(q.pointId),past=state.history.filter(h=>h.questionId===q.id).length;
    const result=c.submitted?c.correct:null;
    main.innerHTML=`<div class="session-top"><div class="session-dots" aria-label="第 ${s.index+1} 题，共 ${s.queue.length} 题">${s.queue.map((_,i)=>`<i class="${i<s.index?'done':i===s.index?'current':''}"></i>`).join('')}<span style="margin-left:8px">${s.index+1} / ${s.queue.length}</span></div><a class="text-button" href="#home">暂停，稍后继续</a></div><div class="question-layout"><section class="question-main"><div class="question-meta"><span>${q.stage==='b'?'迁移检验':'基础检验'}</span>${past&&!c.submitted?'<span>同题复习</span>':''}${c.assisted?'<span>本题已使用辅助</span>':''}</div><h1 id="question-prompt">${esc(q.prompt)}</h1>${q.code?`<pre class="question-code"><code>${esc(q.code)}</code></pre>`:''}<form id="answer-form" aria-labelledby="question-prompt">${quizInput(q,c)}${!c.submitted?`<div class="question-actions"><button type="submit" class="button primary">确认判断</button><button type="button" class="text-button" data-action="hint">给我一点提示</button><button type="button" class="text-button" data-action="skip">这题先跳过</button></div>`:''}</form>${c.showHint?`<div class="hint-box" role="note"><strong>一点提示</strong><p>${esc(q.hint||'先区分对象、类型与行为边界。')}</p></div>`:''}${c.submitted?`<section class="feedback ${result?'':'wrong'}" id="question-feedback" tabindex="-1"><h2>${c.skipped?'先留个记号。':result?c.assisted?'订正完成。':'这一步，判断正确。':'找到一个可以补上的地方。'}</h2>${!result?`<p>参考答案</p><div class="answer">${esc(answerText(q))}</div>`:''}${explanationMarkup(q)}<small>${c.assisted||!result?'本题已记为待巩固，不计入独立通过。':q.stage==='b'?'基础检验与隔日迁移共同构成掌握证据。':'基础证据已记录，迁移检验至少隔日安排。'}</small><div class="button-row">${button(s.index+1===s.queue.length?'完成这一轮':'下一题','next','primary')}${!result&&!c.skipped?button('再试一次','retry','secondary'):''}<a class="text-button" href="#point-${p.id}">查看原文与出处</a></div><details class="source-details"><summary>原文：${esc(p.title)}（#${p.id}）</summary><div class="prose">${p.html}</div></details></section>`:''}</section><aside class="question-side"><h2>把这一步想清楚。</h2><p>先给出你自己的判断，再看解释。<br>暂时想不起来，也可以用提示。</p><p style="margin-top:16px">没有倒计时。<br>中断的位置会自动保留。</p></aside></div>`;
    if(!c.submitted){$('#answer-form').addEventListener('submit',event=>{event.preventDefault();submitAnswer();});const input=$('#answer-input');if(input){input.addEventListener('input',()=>{c.value=input.value;save();});input.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key==='Enter'&&!event.isComposing){event.preventDefault();submitAnswer();}});}if(q.kind==='match')document.querySelectorAll('[data-match]').forEach(el=>el.addEventListener('change',()=>{if(!Array.isArray(c.value))c.value=q.items.map(()=>null);c.value[Number(el.dataset.match)]=el.value===''?null:Number(el.value);save();}));}
  }
  function answerText(q){if(q.kind==='order')return q.answer.map(i=>q.options[i]).join('\n');if(q.kind==='match')return q.answer.map((v,i)=>`${q.items[i]}  →  ${q.options[v]}`).join('\n');return q.kind==='choice'?q.options[Number(q.answer)]:Array.isArray(q.answer)?q.answer.join(' / '):q.answer;}
  function submitAnswer(skip=false){
    const s=state.session;if(!s||s.current.submitted)return;const q=byQuestion.get(s.queue[s.index]),c=s.current;
    if(!skip&&(q.kind==='order'||q.kind==='match')&&(!Array.isArray(c.value)||c.value.length!==q.answer.length||c.value.some(v=>v===null)))return toast('把剩下的项也选好，再确认。');
    if(!skip&&(c.value===null||String(c.value).trim()===''))return toast('先选一个答案，或写下你的判断。');
    c.correct=!skip&&E.grade(q,c.value);c.skipped=skip;c.assisted=c.assisted||c.everWrong||skip;c.submitted=true;
    if(!c.correct)c.everWrong=true;
    const entry=E.record(state,q,{correct:c.correct,assisted:c.assisted,skipped:skip});c.assisted=entry.assisted;c.correct=entry.correct;save();quiz();$('#question-feedback')?.focus({preventScroll:false});
  }
  function nextQuestion(){
    const s=state.session;if(!s?.current?.submitted)return;const q=byQuestion.get(s.queue[s.index]);
    s.answers.push({questionId:q.id,pointId:q.pointId,correct:s.current.correct,assisted:s.current.assisted,skipped:s.current.skipped});s.index++;s.current={value:null,assisted:false,submitted:false,everWrong:false};
    if(s.index===s.queue.length)state.rounds++;save();render();
  }
  function finishRound(){
    const s=state.session,n=s.answers.filter(a=>a.correct&&!a.assisted).length;
    main.innerHTML=`<section class="round-finish"><div class="finish-mark" aria-hidden="true">✓</div><p class="eyebrow">这一轮，已经完成。</p><h1>向前了一小步。</h1><p class="subline">完成 ${s.queue.length} 题，其中 ${n} 题独立通过。<br>停在这里，也是一轮完整的学习。</p><div class="round-results">${s.answers.map(a=>`<div class="round-result"><span style="color:${a.correct&&!a.assisted?'var(--green)':'var(--red)'}">${a.correct&&!a.assisted?'✓':'↻'}</span><a href="#point-${a.pointId}">${esc(byId.get(a.pointId).title)}</a><span>${a.skipped?'留待下次':a.assisted?'辅助完成':a.correct?'独立通过':'待巩固'}</span></div>`).join('')}</div><div class="button-row">${button('到这里，回到今天','end-round','primary')}${button('再来 3 题','another-round','secondary')}</div><p class="hero-note">答错的地方会回到复习队列。无需现在全部解决。</p></section>`;
  }
  function labs(){
    const catalog=window.CLabLabs?.catalog||[];
    main.innerHTML=`<div class="section-head"><div><h1>自由实验</h1><p>把抽象规则，变成能亲手操作的东西。</p></div></div><p class="model-note">每个工作台都有明确的教学模型与输入范围。你可以单步、重置、尝试边界；这里不编译任意 C 程序。</p><div class="lab-list">${catalog.map((lab,i)=>`<article class="lab-card"><span class="lab-index">${String(i+1).padStart(2,'0')}</span><div><h2>${esc(lab.title)}</h2><p>${esc(lab.summary)}</p><a class="button secondary small" href="#lab-${lab.id}">开始实验</a>${state.labs[lab.id]?'<span class="lab-completed">✓ 挑战已完成</span>':''}<small style="display:block;margin-top:12px">对应第 ${lab.chapters.map(c=>String(c).padStart(2,'0')).join('、')} 章</small></div></article>`).join('')}</div>`;
  }
  function labView(id){
    const lab=window.CLabLabs?.catalog.find(l=>l.id===id);if(!lab)return notFound();
    main.innerHTML=`<div class="lab-heading"><a class="text-button" href="#labs">全部实验</a><h1>${esc(lab.title)}</h1><p class="subline">${esc(lab.summary)}</p></div><div id="lab-root"></div><div class="button-row" style="border-top:1px solid var(--line);padding-top:24px;margin-top:28px">${lab.chapters.map(c=>`<a class="text-button" href="#chapter-${c}">回看第 ${String(c).padStart(2,'0')} 章</a>`).join('')}</div>`;
    cleanupLab=window.CLabLabs.mount($('#lab-root'),id,completed=>{if(!state.labs[completed]){state.labs[completed]=Date.now();save();toast('实验挑战完成。这个能力印记已保存。');}});
  }
  function progress(){
    const s=stats();
    main.innerHTML=`<div class="section-head"><div><h1>学习记录</h1><p>记录你做到了什么，也留住还需要练习的地方。</p></div></div><div class="metrics"><div class="metric"><strong>${s.practiced}</strong><span>已练知识点 / ${D.points.length}</span></div><div class="metric"><strong>${s.independent}</strong><span>基础独立通过</span></div><div class="metric"><strong>${s.transfer}</strong><span>隔日迁移通过</span></div></div><p class="model-note">阅读和提示后完成不算独立掌握。基础题、隔日迁移题均无提示通过后，记录迁移证据；后续失误会标记待巩固。实验印记单独记录。</p><section class="home-section"><div class="section-head"><h2>每一章的位置</h2><small>${state.rounds} 轮完成 · ${Object.keys(state.labs).length} 个实验印记</small></div><div class="chapter-progress">${D.chapters.map(c=>{const n=c.pointIds.filter(id=>state.points[id]?.transfer&&!state.points[id]?.needsWork).length;return `<a href="#chapter-${c.id}" class="chapter-progress-row"><span>${esc(c.title)}</span><span class="progress-track"><span style="width:${n/c.pointIds.length*100}%"></span></span><small>${n} / ${c.pointIds.length}</small></a>`;}).join('')}</div></section><section class="home-section"><div class="section-head"><h2>最近的练习</h2>${s.due?`<a class="text-button" href="${href('knowledge',{filter:'due'})}">${s.due} 个待复习</a>`:''}</div>${state.history.length?`<div class="history-list">${state.history.slice(-18).reverse().map(h=>`<div class="history-row"><span style="color:${h.correct&&!h.assisted?'var(--green)':'var(--red)'}">${h.correct&&!h.assisted?'✓':'↻'}</span><a href="#point-${h.pointId}">${esc(byId.get(h.pointId)?.title||h.pointId)}</a><span>${h.stage==='b'?'迁移':'基础'} · ${h.skipped?'跳过':h.assisted?'辅助':h.correct?'通过':'待巩固'}</span><time>${esc(new Date(h.time).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'}))}</time></div>`).join('')}</div>`:'<div class="empty"><p>这里还没有练习记录。完成第一轮后，你的足迹会留在这里。</p></div>'}</section><section class="backup-block"><h2>把进度带走。</h2><p>电脑和手机各自保存。导出一个进度文件，在另一台设备导入，即可接着学。</p><div class="button-row">${button('导出进度','export','secondary')}${button('导入与设置','settings','secondary')}</div></section>`;
  }
  function settings(){
    $('#settings-content').innerHTML=`<p class="setting-copy">默认没有声音、倒计时和自动播放。你的学习进度保存在当前浏览器中。</p><div class="setting-row"><label for="reduce-motion">减少动态效果<small>保留必要的状态反馈。</small></label><input id="reduce-motion" type="checkbox" ${state.settings.reduceMotion?'checked':''}></div><div class="setting-row"><label for="text-size">文字大小<small>代码区域可以独立滚动。</small></label><select id="text-size"><option value="1">标准</option><option value="1.1" ${state.settings.textSize===1.1?'selected':''}>稍大</option><option value="1.2" ${state.settings.textSize===1.2?'selected':''}>更大</option></select></div><section class="setting-backup"><h3>备份与跨设备迁移</h3><p class="setting-copy">本地 HTML 在不同浏览器、不同文件路径下的存储可能不同。定期导出进度文件；导入会替换本机当前进度，建议先导出备份。</p><div class="button-row">${button('导出进度文件','export','primary')}<button class="button secondary" type="button" id="import-open">选择进度文件</button></div><input id="import-file" type="file" accept=".json,application/json" hidden><div id="import-preview"></div><p id="import-error" class="import-error" role="alert"></p></section><section class="setting-backup"><h3>离线文件怎么用</h3><p class="setting-copy">Windows：直接用浏览器打开 C-Lab.html。安卓：将文件保存到设备，再用支持本地 HTML 的浏览器打开；文件管理器的静态预览可能不执行脚本。这个网页无需安装，也不需要联网。参考资料链接仅在你主动点击时访问网络。</p></section>`;
    $('#reduce-motion').addEventListener('change',event=>{state.settings.reduceMotion=event.target.checked;settingsApply();save();});
    $('#text-size').addEventListener('change',event=>{state.settings.textSize=Number(event.target.value);settingsApply();save();});
    $('#import-open').addEventListener('click',()=>$('#import-file').click());
    $('#import-file').addEventListener('change',async event=>{
      $('#import-error').textContent='';$('#import-preview').innerHTML='';const file=event.target.files[0];if(!file)return;
      try{
        if(file.size>25*1024*1024)throw Error('文件超过 25 MB，请选择导出的进度 JSON。');
        const candidate=progressFiles.restore(JSON.parse(await file.text()));
        $('#import-preview').innerHTML=`<p class="setting-copy" style="margin-top:16px">文件包含 ${Object.keys(candidate.points).length} 个已练知识点、${candidate.history.length} 条作答记录。确认后替换本机进度。</p><div class="button-row" style="margin-top:12px"><button class="button primary" id="confirm-import" type="button">确认导入并替换</button><button class="text-button" id="cancel-import" type="button">取消</button></div>`;
        $('#confirm-import').addEventListener('click',()=>{state=candidate;state.updatedAt=Date.now();localProgress.replace(state);settingsApply();$('#settings-dialog').close();render();toast('进度已导入，可以接着学习。');});
        $('#cancel-import').addEventListener('click',()=>{$('#import-preview').innerHTML='';$('#import-file').value='';});
      }catch(error){$('#import-error').textContent=error instanceof SyntaxError?'文件不是有效的 JSON 进度文件。':error.message;}
    });
    $('#settings-dialog').showModal();
  }
  function exportProgress(){
    const payload=progressFiles.backup(state);const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`C-Lab-progress-${E.day()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('进度文件已准备下载。');
  }
  function notFound(){main.innerHTML=`<div class="empty"><h1>这个位置没有内容。</h1><p style="margin-top:18px"><a class="text-button" href="#knowledge">回到知识地图</a></p></div>`;}
  function render(){
    if(cleanupLab){cleanupLab();cleanupLab=null;}closeNav();const {name,params}=route();navigation(name);
    if(name==='home')home();else if(name==='knowledge')knowledge(params);else if(name==='quiz')quiz();else if(name==='drill')drill.render(main,state,drillBank,save,esc,explanationMarkup);else if(name==='labs')labs();else if(name==='progress')progress();else if(name.startsWith('point-'))pointView(Number(name.slice(6)));else if(name.startsWith('chapter-'))chapterView(Number(name.slice(8)));else if(name.startsWith('cluster-')){const cluster=D.clusters.find(c=>c.id===name.slice(8));if(cluster){chapterView(cluster.chapter);setTimeout(()=>document.getElementById(`cluster-row-${cluster.id}`)?.scrollIntoView(),0);}else notFound();}else if(name.startsWith('lab-'))labView(name.slice(4));else notFound();updateStorage();
  }
  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
    if(action==='skip-main'){event.preventDefault();main.focus();}else if(action==='start')startSession();else if(action==='resume')location.hash='quiz';else if(action==='start-chapter')startSession({chapter:Number(el.dataset.chapter)});else if(action==='start-point')startSession({pointId:Number(el.dataset.point)});
    else if(action==='hero-next'){if(heroIndex<4){heroIndex++;drawHero();}else toast('已经到达尾后位置，不能继续向前。');}
    else if(action==='hero-back'){heroIndex=Math.max(0,heroIndex-1);drawHero();}
    else if(action==='settings')settings();else if(action==='close-settings')$('#settings-dialog').close();else if(action==='export')exportProgress();
    else if(action==='choose'){const c=state.session?.current;if(!c||c.submitted)return;c.value=Number(el.dataset.index);save();document.querySelectorAll('.choice').forEach((b,i)=>{b.classList.toggle('selected',i===c.value);b.setAttribute('aria-pressed',i===c.value);});}
    else if(action==='seq-add'||action==='seq-undo'){const c=state.session?.current;if(!c||c.submitted)return;if(!Array.isArray(c.value))c.value=[];if(action==='seq-undo')c.value.pop();else if(!c.value.includes(Number(el.dataset.index)))c.value.push(Number(el.dataset.index));save();quiz();($('#answer-form [data-action=seq-add]:not(:disabled)')||$('#answer-form button[type=submit]'))?.focus({preventScroll:true});}
    else if(action==='hint'){const c=state.session?.current;if(!c||c.submitted)return;c.assisted=true;c.showHint=true;save();quiz();}
    else if(action==='skip')submitAnswer(true);else if(action==='next')nextQuestion();else if(action==='retry'){const c=state.session.current;c.submitted=false;c.assisted=true;c.value=null;save();quiz();}
    else if(action==='end-round'){state.session=null;save();location.hash='home';}
    else if(action==='another-round')startSession(state.session?.scope||{});
    else if(action==='filter'){const chapter=$('#chapter-filter')?.value||'all',q=$('#knowledge-search')?.value||'';searchLimit=70;location.hash=href('knowledge',{chapter,q,filter:el.dataset.filter});}
    else if(action==='more-points'){searchLimit+=70;const p=route().params;renderKnowledgeResults($('#chapter-filter').value,$('#knowledge-search').value,p.get('filter')||'all');}
  });
  $('#toggle-nav').addEventListener('click',()=>{if(matchMedia('(max-width:900px)').matches){document.body.classList.toggle('nav-open');const open=document.body.classList.contains('nav-open');$('#nav-scrim').hidden=!open;$('#sidebar').inert=!open;if(open)$('#sidebar a').focus();}else document.body.classList.toggle('nav-collapsed');});
  $('#close-nav').addEventListener('click',()=>{if(matchMedia('(max-width:900px)').matches)closeNav();else document.body.classList.add('nav-collapsed');});
  $('#nav-scrim').addEventListener('click',closeNav);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeNav();});
  window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);main.focus({preventScroll:true});});
  window.addEventListener('beforeunload',save);
  window.addEventListener('resize',()=>{$('#sidebar').inert=matchMedia('(max-width:900px)').matches&&!document.body.classList.contains('nav-open');});
  settingsApply();render();save();
  // Read-only QA surface: no stored answer data is exposed in the visible challenge UI.
  window.CLabDebug={counts:D.counts,getState:()=>JSON.parse(JSON.stringify(state))};
};
