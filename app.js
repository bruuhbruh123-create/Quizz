const { createClient } = supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = id => document.getElementById(id);
let quizzes = [];
let results = [];
let editingQuizId = null;
let playingQuiz = null;
let currentQuestion = 0;
let lastUserAnswers = [];
let answerLocked = false;

function configured() {
  return window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    !window.SUPABASE_URL.includes("COLLE_ICI") &&
    !window.SUPABASE_ANON_KEY.includes("COLLE_ICI");
}
function show(id, yes=true){ $(id).classList.toggle("hidden", !yes); }
function setMessage(id, text, ok=false){
  const el=$(id); el.textContent=text; el.style.color=ok ? "#15803d" : "#dc2626";
}
function setTab(name){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id===name));
  if(name==="results") renderResults();
  if(name==="library") renderLibrary();
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

async function init(){
  $("loading").classList.remove("hidden");
  if(!configured()){
    $("loading").textContent="Configuration Supabase manquante. Ouvre config.js et colle les deux valeurs.";
    return;
  }
  const {data:{session}} = await db.auth.getSession();
  $("loading").classList.add("hidden");
  if(session) await enterApp(); else enterAuth();
  db.auth.onAuthStateChange(async (_event, session)=>{
    if(session) await enterApp(); else enterAuth();
  });
}
function enterAuth(){
  show("authView",true); show("appView",false);
}
async function enterApp(){
  show("authView",false); show("appView",true);
  $("syncStatus").textContent="● Synchronisation en ligne";
  await loadAll();
}
async function loadAll(){
  const {data: q, error:qErr}=await db.from("quizzes").select("*").order("updated_at",{ascending:false});
  if(qErr){ alert("Impossible de charger les quiz : "+qErr.message); return; }
  quizzes=(q||[]).map(row=>({...row.data,id:row.id,name:row.name}));
  const {data:r, error:rErr}=await db.from("results").select("*").order("created_at",{ascending:false}).limit(100);
  if(rErr){ console.warn(rErr); }
  results=r||[];
  renderLibrary();
  renderResults();
}

$("loginBtn").onclick=async()=>{
  const email=$("authEmail").value.trim();
  const password=$("authPassword").value;
  if(!email||!password){setMessage("authMessage","Entre ton e-mail et ton code secret.");return;}
  const {error}=await db.auth.signInWithPassword({email,password});
  if(error) setMessage("authMessage","Connexion impossible : "+error.message);
};
$("signupBtn").onclick=async()=>{
  const email=$("authEmail").value.trim();
  const password=$("authPassword").value;
  if(!email||!password){setMessage("authMessage","Entre ton e-mail et un code secret.");return;}
  if(password.length<8){setMessage("authMessage","Le code secret doit contenir au moins 8 caractères.");return;}
  const {data,error}=await db.auth.signUp({email,password});
  if(error){setMessage("authMessage","Création impossible : "+error.message);return;}
  if(!data.session){
    setMessage("authMessage","Compte créé. Vérifie ton e-mail puis reviens te connecter.",true);
  }else{
    setMessage("authMessage","Compte créé !",true);
  }
};
$("logoutBtn").onclick=async()=>{await db.auth.signOut();};

$("newQuizBtn").onclick=()=>startEditor();
$("cancelEditBtn").onclick=()=>{setTab("library");};
$("addQuestionBtn").onclick=()=>addQuestionEditor();
$("quizForm").onsubmit=saveQuiz;

function startEditor(quiz=null){
  editingQuizId=quiz?.id||null;
  $("editorTitle").textContent=quiz?"Modifier le quiz":"Créer un quiz";
  $("quizName").value=quiz?.name||"";
  $("editingQuizId").value=editingQuizId||"";
  $("questionsEditor").innerHTML="";
  (quiz?.questions?.length ? quiz.questions : [{text:"",options:["",""],correct:[],explanation:""}])
    .forEach(q=>addQuestionEditor(q));
  setTab("editor");
}
function addQuestionEditor(q={text:"",options:["",""],correct:[],explanation:""}){
  const node=$("questionTemplate").content.cloneNode(true);
  const article=node.querySelector(".question-editor");
  article.querySelector(".q-text").value=q.text||"";
  article.querySelector(".q-explanation").value=q.explanation||"";
  const opts=article.querySelector(".options");
  (q.options?.length?q.options:["",""]).forEach((txt,i)=>addOptionRow(opts,txt,(q.correct||[]).includes(i)));
  article.querySelector(".add-option").onclick=()=>addOptionRow(opts,"",false);
  article.querySelector(".remove-question").onclick=()=>{article.remove();renumberQuestions();};
  $("questionsEditor").appendChild(article);
  renumberQuestions();
}
function addOptionRow(container,text="",correct=false){
  if(container.children.length>=10){alert("Maximum : 10 réponses.");return;}
  const node=$("optionTemplate").content.cloneNode(true);
  const row=node.querySelector(".option-row");
  row.querySelector(".option-text").value=text;
  row.querySelector(".correct-check").checked=correct;
  row.querySelector(".remove-option").onclick=()=>{row.remove();};
  container.appendChild(row);
}
function renumberQuestions(){
  [...document.querySelectorAll(".question-editor")].forEach((el,i)=>el.querySelector(".question-number").textContent=i+1);
}
async function saveQuiz(e){
  e.preventDefault();
  const name=$("quizName").value.trim();
  const articles=[...document.querySelectorAll(".question-editor")];
  if(!name||!articles.length){alert("Ajoute un nom et au moins une question.");return;}
  const questions=[];
  for(const article of articles){
    const text=article.querySelector(".q-text").value.trim();
    const rows=[...article.querySelectorAll(".option-row")];
    const options=rows.map(r=>r.querySelector(".option-text").value.trim());
    const correct=rows.map((r,i)=>r.querySelector(".correct-check").checked?i:-1).filter(i=>i>=0);
    const explanation=article.querySelector(".q-explanation").value.trim();
    if(!text||options.some(x=>!x)||options.length<2||!correct.length){
      alert("Chaque question doit avoir un énoncé, au moins 2 réponses remplies et au moins 1 bonne réponse.");
      return;
    }
    questions.push({text,options,correct,explanation});
  }
  const id=editingQuizId||crypto.randomUUID();
  const payload={id,name,questions};
  const {data:{user}}=await db.auth.getUser();
  const row={id,user_id:user.id,name,data:payload,updated_at:new Date().toISOString()};
  const {error}=await db.from("quizzes").upsert(row);
  if(error){alert("Erreur de sauvegarde : "+error.message);return;}
  await loadAll(); setTab("library");
}
function renderLibrary(){
  const box=$("quizList"); box.innerHTML="";
  if(!quizzes.length){
    box.innerHTML='<div class="card"><h3>Aucun quiz</h3><p class="muted">Commence par créer ton premier QCM.</p></div>';return;
  }
  quizzes.forEach(q=>{
    const el=document.createElement("article");el.className="quiz-card";
    el.innerHTML=`<h3></h3><div class="quiz-meta"></div><div class="quiz-actions">
      <button class="primary small play">▶️ S'entraîner</button>
      <button class="secondary small edit">✏️ Modifier</button>
      <button class="ghost small danger delete">Supprimer</button></div>`;
    el.querySelector("h3").textContent=q.name;
    el.querySelector(".quiz-meta").textContent=`${q.questions.length} question${q.questions.length>1?"s":""}`;
    el.querySelector(".play").onclick=()=>startPlay(q);
    el.querySelector(".edit").onclick=()=>startEditor(q);
    el.querySelector(".delete").onclick=()=>deleteQuiz(q);
    box.appendChild(el);
  });
}
async function deleteQuiz(q){
  if(!confirm(`Supprimer « ${q.name} » ?`))return;
  const {error}=await db.from("quizzes").delete().eq("id",q.id);
  if(error){alert(error.message);return;}
  await loadAll();
}

function startPlay(q){
  playingQuiz=q;currentQuestion=0;answerLocked=false;lastUserAnswers=[];
  $("playTitle").textContent=q.name;
  setTab("play");renderPlayQuestion();
}
function renderPlayQuestion(){
  const q=playingQuiz.questions[currentQuestion];
  $("playProgress").textContent=`Question ${currentQuestion+1} / ${playingQuiz.questions.length}`;
  $("progressBar").style.width=`${((currentQuestion)/playingQuiz.questions.length)*100}%`;
  const box=$("playQuestion");box.innerHTML="";
  const h=document.createElement("h3");h.textContent=q.text;box.appendChild(h);
  q.options.forEach((opt,i)=>{
    const label=document.createElement("label");label.className="answer-choice";
    label.innerHTML=`<input type="checkbox" data-index="${i}"><span></span>`;
    label.querySelector("span").textContent=opt;box.appendChild(label);
  });
  $("validateBtn").classList.remove("hidden");$("nextBtn").classList.add("hidden");
  answerLocked=false;
}
$("validateBtn").onclick=()=>{
  if(answerLocked)return;
  const q=playingQuiz.questions[currentQuestion];
  const selected=[...$("playQuestion").querySelectorAll("input:checked")].map(x=>Number(x.dataset.index));
  if(!selected.length){alert("Sélectionne au moins une réponse.");return;}
  lastUserAnswers[currentQuestion]=selected;
  const exact=selected.length===q.correct.length && selected.every(x=>q.correct.includes(x));
  [...$("playQuestion").querySelectorAll(".answer-choice")].forEach((el,i)=>{
    if(q.correct.includes(i))el.classList.add("correct");
    if(selected.includes(i)&&!q.correct.includes(i))el.classList.add("wrong");
    el.querySelector("input").disabled=true;
  });
  const f=document.createElement("div");f.className="feedback";
  f.innerHTML=`<strong>${exact?"✅ Correct !":"❌ Incorrect"}</strong>${q.explanation?`<p>${escapeHtml(q.explanation)}</p>`:""}`;
  $("playQuestion").appendChild(f);
  answerLocked=true;$("validateBtn").classList.add("hidden");$("nextBtn").classList.remove("hidden");
};
$("nextBtn").onclick=async()=>{
  if(currentQuestion<playingQuiz.questions.length-1){currentQuestion++;renderPlayQuestion();}
  else await finishPlay();
};
$("quitPlayBtn").onclick=()=>setTab("library");

async function finishPlay(){
  let score=0;
  playingQuiz.questions.forEach((q,i)=>{
    const a=lastUserAnswers[i]||[];
    if(a.length===q.correct.length&&a.every(x=>q.correct.includes(x)))score++;
  });
  $("progressBar").style.width="100%";
  const box=$("playQuestion");box.innerHTML=`<div class="card"><h2>Quiz terminé 🎉</h2><div class="score">${score} / ${playingQuiz.questions.length}</div><p>${Math.round(score/playingQuiz.questions.length*100)} %</p><h3>Erreurs</h3></div>`;
  const wrong=playingQuiz.questions.map((q,i)=>({q,i})).filter(({q,i})=>{
    const a=lastUserAnswers[i]||[];return !(a.length===q.correct.length&&a.every(x=>q.correct.includes(x)));
  });
  const card=box.querySelector(".card");
  if(!wrong.length) card.insertAdjacentHTML("beforeend","<p>🎯 Aucune erreur !</p>");
  else wrong.forEach(({q,i})=>{
    const d=document.createElement("div");d.className="result-row";
    d.innerHTML=`<strong>Question ${i+1}</strong><p></p><small>Bonne(s) réponse(s) : ${q.correct.map(x=>escapeHtml(q.options[x])).join(", ")}</small>`;
    d.querySelector("p").textContent=q.text;card.appendChild(d);
  });
  const {data:{user}}=await db.auth.getUser();
  const {error}=await db.from("results").insert({
    user_id:user.id,quiz_id:playingQuiz.id,quiz_name:playingQuiz.name,
    score,total:playingQuiz.questions.length,answers:lastUserAnswers
  });
  if(error) console.warn(error);
  await loadAll();
  $("validateBtn").classList.add("hidden");$("nextBtn").classList.add("hidden");
}
function renderResults(){
  const box=$("resultsList");box.innerHTML="";
  if(!results.length){box.innerHTML='<div class="card"><p class="muted">Aucun résultat pour le moment.</p></div>';return;}
  results.forEach(r=>{
    const d=document.createElement("div");d.className="result-row";
    const date=new Date(r.created_at).toLocaleString("fr-FR");
    d.innerHTML=`<strong></strong><div></div>`;
    d.querySelector("strong").textContent=r.quiz_name;
    d.querySelector("div").textContent=`${r.score}/${r.total} — ${Math.round(r.score/r.total*100)} % — ${date}`;
    box.appendChild(d);
  });
}
$("clearResultsBtn").onclick=async()=>{
  if(!confirm("Effacer tout ton historique ?"))return;
  const {data:{user}}=await db.auth.getUser();
  const {error}=await db.from("results").delete().eq("user_id",user.id);
  if(error){alert(error.message);return;} await loadAll();
};
$("exportBtn").onclick=()=>{
  const data={version:2,exportedAt:new Date().toISOString(),quizzes,results};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="mes-qcm-sauvegarde.json";a.click();
  URL.revokeObjectURL(a.href);
};
$("importBtn").onclick=async()=>{
  const file=$("importFile").files[0];if(!file){setMessage("backupMessage","Choisis un fichier JSON.");return;}
  try{
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.quizzes)){throw new Error("Fichier invalide.");}
    const {data:{user}}=await db.auth.getUser();
    for(const q of data.quizzes){
      const payload={id:q.id||crypto.randomUUID(),name:q.name,questions:q.questions};
      const {error}=await db.from("quizzes").upsert({id:payload.id,user_id:user.id,name:payload.name,data:payload,updated_at:new Date().toISOString()});
      if(error)throw error;
    }
    setMessage("backupMessage","Import terminé.",true);await loadAll();
  }catch(e){setMessage("backupMessage","Import impossible : "+e.message);}
};
function escapeHtml(s){const d=document.createElement("div");d.textContent=s||"";return d.innerHTML;}
init();
