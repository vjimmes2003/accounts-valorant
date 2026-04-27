const STORAGE='valorant-personal-accounts-v2';

const riotInput=document.getElementById('riotInput');
const apiInput=document.getElementById('apiInput');
const addBtn=document.getElementById('addBtn');
const scanBtn=document.getElementById('scanBtn');
const accountList=document.getElementById('accountList');

let accounts=load();
render();

function load(){
try{return JSON.parse(localStorage.getItem(STORAGE)||'[]');}
catch{return[]}
}

function save(){
localStorage.setItem(STORAGE,JSON.stringify(accounts));
}

function parseRiot(text){
if(!text.includes('#'))return null;
const[name,tag]=text.split('#');
return{name:name.trim(),tag:tag.trim()};
}

addBtn.onclick=()=>{
const parsed=parseRiot(riotInput.value);
if(!parsed)return alert('Formato inválido. Usa nombre#tag');
accounts.push(parsed);
riotInput.value='';
save();
render();
};

scanBtn.onclick=async()=>{
const apiKey=apiInput.value.trim();
if(!apiKey)return alert('Introduce tu API key');

for(const acc of accounts){
try{
const res=await fetch('/api/rank',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey,accounts:[acc]})});
const data=await res.json();
acc.data=data.results?.[0];
}catch(e){acc.error=e.message}
}

save();
render();
};

function render(){
accountList.innerHTML='';
accounts.forEach((acc,i)=>{
const row=document.createElement('div');
row.className='personal-row';

const name=document.createElement('strong');
name.textContent=`${acc.name}#${acc.tag}`;

const status=document.createElement('small');
status.textContent=acc.data?.data?.current?.tier?.name||'sin datos';

const del=document.createElement('button');
del.textContent='X';
del.className='btn btn-small';

del.onclick=()=>{
accounts.splice(i,1);
save();
render();
};

row.appendChild(name);
row.appendChild(status);
row.appendChild(del);

accountList.appendChild(row);
});
}
