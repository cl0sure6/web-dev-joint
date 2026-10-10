const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..').replaceAll('\\','/');
const cli=process.env.PHP_BINARY || 'php';
const cgi=process.env.PHP_CGI_BINARY || 'php-cgi';
const runtime=path.join(process.env.MEMBER_TEST_DIR || path.join(__dirname,'.runtime'),String(Date.now()));
fs.mkdirSync(runtime,{recursive:true});
const db=path.join(runtime,'club.sqlite');


const env={...process.env,CLUB_DATABASE_PATH:db};
const seed=spawnSync(cli,[path.join(__dirname,'seed-members.php')],{env,encoding:'utf8'});
assert.equal(seed.status,0,seed.stderr);
const day=seed.stdout.trim();
const pass='MemberTestPass123!';
let checks=0;
function check(ok,label){assert.ok(ok,label);console.log('PASS: '+label);checks++;}
function request(client,file,query='',body=null,form=false){
 const input=body===null?'':form?new URLSearchParams(body).toString():JSON.stringify(body);
 const r=spawnSync(cgi,[],{cwd:root,env:{...env,REDIRECT_STATUS:'200',GATEWAY_INTERFACE:'CGI/1.1',SERVER_PROTOCOL:'HTTP/1.1',SERVER_NAME:'localhost',SERVER_PORT:'80',REMOTE_ADDR:'127.0.0.1',REQUEST_METHOD:body===null?'GET':'POST',SCRIPT_FILENAME:root+'/'+file,SCRIPT_NAME:'/'+file,REQUEST_URI:'/'+file+'?'+query,QUERY_STRING:query,CONTENT_TYPE:form?'application/x-www-form-urlencoded':'application/json',CONTENT_LENGTH:String(Buffer.byteLength(input)),HTTP_COOKIE:client.cookie||'',HTTP_X_CSRF_TOKEN:client.csrf||''},input,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 assert.ok(!/Fatal error|Warning:|Deprecated:/.test(r.stdout+r.stderr),r.stdout+r.stderr);
 const split=r.stdout.indexOf('\r\n\r\n');
 const headers=r.stdout.slice(0,split),text=r.stdout.slice(split+4);
 const code=Number(headers.match(/Status: (\d+)/i)?.[1]||(/Location:/i.test(headers)?302:200));
 const cookie=headers.match(/Set-Cookie: ([^;\r\n]+)/i)?.[1];
 if(cookie)client.cookie=cookie;
 return {code,headers,text};
}
function api(client,action,data=null,expected=200,extra=''){
 const r=request(client,'api.php','action='+action+extra,data);
 assert.equal(r.code,expected,`${action}: ${r.text}`);
 const j=JSON.parse(r.text);if(j.csrf)client.csrf=j.csrf;return j;
}
function client(){let c={};api(c,'session');return c;}
const a=client(),b=client(),guest=client();
api(guest,'member-data',null,401);
check(true,'Anonymous requests are rejected');
api(a,'member-register',{name:'Alice Example',email:'alice@test.example',password:pass,password_confirmation:pass,role:'admin'});
api(b,'member-register',{name:'Bob Example',email:'bob@test.example',password:pass,password_confirmation:pass});
let data=api(a,'member-data');
check(data.user.role==='user'&&!('password_hash'in data.user),'Registration forces member role; password hash stays private');
check(data.bookings.length===0&&data.membership===null,'New member has honest empty states');
api({...a,csrf:'invalid'},'member-book',{schedule_id:1,date:day},403);
api(a,'member-book',{schedule_id:1,date:'2020-01-01'},422);
const wrongDate=new Date(day+'T12:00:00Z');wrongDate.setUTCDate(wrongDate.getUTCDate()+1);
api(a,'member-book',{schedule_id:1,date:wrongDate.toISOString().slice(0,10)},409);
api(a,'member-book',{schedule_id:1,date:day});
api(b,'member-book',{schedule_id:1,date:day},409);
check(true,'CSRF, date, weekday and last-seat validation work');
data=api(a,'member-data');const booking=data.bookings[0].id;
api(b,'member-cancel',{id:booking},409);
check(api(b,'member-data').bookings.length===0,'Members cannot see or cancel another member booking');
api(a,'member-cancel',{id:booking});
api(a,'member-book',{schedule_id:1,date:day});
data=api(a,'member-data');
check(data.bookings.length===1&&data.bookings[0].status==='confirmed','Cancellation and rebooking reuse one record');
const schedule=api(a,'member-schedule',null,200,'&date='+day);
check(schedule.classes[0].booking_id===booking&&schedule.classes[0].booked===1,'Schedule reports own booking and live capacity');
api(a,'member-profile',{name:'Alice',email:'bob@test.example',current_password:pass},409);
api(a,'member-profile',{name:'Alice',email:'alice.new@test.example',current_password:'wrong'},422);
api(a,'member-profile',{name:'Alice Updated',email:'alice.new@test.example',current_password:pass});
const second=client();api(second,'member-login',{email:'alice.new@test.example',password:pass});
api(a,'member-password',{current_password:pass,new_password:'ChangedTestPass456!',password_confirmation:'ChangedTestPass456!'});
api(second,'member-data',null,401);
api(guest,'member-login',{email:'alice.new@test.example',password:pass},401);
api(guest,'member-login',{email:'alice.new@test.example',password:'ChangedTestPass456!'});
check(true,'Profile changes, password change and old-session invalidation work');
api(a,'review',{rating:5,comment:'Excellent test class.'});api(a,'admin-data',null,401);
check(true,'Members can submit reviews but cannot access admin API');
const admin={};let page=request(admin,'admin/login.php');
admin.csrf=page.text.match(/name="csrf" value="([^"]+)"/)[1];
let response=request(admin,'admin/login.php','',{csrf:admin.csrf,email:'admin@test.example',password:'TestAdminPass123!'},true);
assert.equal(response.code,302,response.text);
page=request(admin,'admin/member-plans.php');admin.csrf=page.text.match(/name="csrf" value="([^"]+)"/)[1];
const today=api(a,'member-data').today;
response=request(admin,'admin/member-plans.php','',{csrf:admin.csrf,user_id:data.user.id,membership_id:2,starts_on:today},true);
assert.equal(response.code,302,response.text);
data=api(a,'member-data');
check(data.membership.status==='active'&&data.membership.name==='1 Month','Admin assignment appears in member overview');
response=request(admin,'admin/member-plans.php','',{csrf:admin.csrf,user_id:data.user.id,membership_id:2,starts_on:today},true);
check(response.text.includes('already has a membership'),'Overlapping memberships rejected');

page=request(a,'account/index.php');
assert.equal(page.code,200, page.headers+'\n'+page.text.slice(0,600));
check(page.text.includes('lang="en"')&&page.text.includes('My bookings'),'Protected English account page renders');
fs.writeFileSync(path.join(runtime,'account-render.html'),page.text);
fs.writeFileSync(path.join(runtime,'login-render.html'),request({},'account/login.php').text);
response=request(a,'account/logout.php','',{csrf:a.csrf},true);assert.equal(response.code,302);
api(a,'member-data',null,401);
check(true,'Logout clears authentication');
console.log(`${checks} integration groups passed.`);
