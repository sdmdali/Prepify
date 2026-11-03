'use strict';
// Creates an isolated demo database and seeds a small real question bank.
// The existing DB_NAME database is never altered or dropped.
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const dbName = process.env.PREPIFY_DEMO_DB || 'prepify_demo';
if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error('Invalid PREPIFY_DEMO_DB name.');
const hash = (s) => crypto.createHash('sha256').update(String(s).toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex');
const questions = [
 ['What does CPU stand for?',['Central Processing Unit','Computer Personal Unit','Central Program Utility','Control Processing User'],0,'easy'],
 ['Which data structure follows FIFO?',['Stack','Queue','Tree','Graph'],1,'easy'],
 ['Which data structure follows LIFO?',['Queue','Array','Stack','Linked list'],2,'easy'],
 ['Which language is primarily used to style web pages?',['HTML','CSS','SQL','Java'],1,'easy'],
 ['Which SQL command retrieves records?',['GET','FETCH ALL','SELECT','OPEN'],2,'easy'],
 ['Which key uniquely identifies a row in a relational table?',['Foreign key','Primary key','Duplicate key','Index value'],1,'easy'],
 ['Which HTML element creates a hyperlink?',['<link>','<a>','<href>','<url>'],1,'easy'],
 ['Which JavaScript keyword declares a block-scoped variable that can be reassigned?',['const','let','static','final'],1,'easy'],
 ['What is the time complexity of binary search on a sorted array?',['O(n)','O(n²)','O(log n)','O(1) always'],2,'medium'],
 ['Which protocol is commonly used to secure HTTP traffic?',['FTP','SSH','TLS','SMTP'],2,'medium'],
 ['Which normal form removes partial dependency on a composite key?',['1NF','2NF','3NF','BCNF only'],1,'medium'],
 ['In Java, which keyword is used to inherit a class?',['implements','inherits','extends','super'],2,'easy'],
 ['Which SQL clause filters grouped results?',['WHERE','ORDER BY','HAVING','DISTINCT'],2,'medium'],
 ['Which of these is not an operating system?',['Linux','Windows','Oracle','macOS'],2,'easy'],
 ['What does DNS primarily do?',['Encrypts files','Maps domain names to IP addresses','Assigns MAC addresses','Compresses web pages'],1,'medium'],
 ['Which HTTP method is conventionally used to create a resource?',['GET','POST','TRACE','HEAD'],1,'easy'],
 ['Which Java collection does not allow duplicate elements?',['ArrayList','HashSet','LinkedList','Vector'],1,'medium'],
 ['What is the result of 5 % 2 in JavaScript?',['0','1','2','2.5'],1,'easy'],
 ['Which database object is designed to speed up lookups?',['Trigger','Index','Cursor','View only'],1,'medium'],
 ['Which CSS layout system is designed for one-dimensional row or column layouts?',['Float','Flexbox','Table only','Position absolute'],1,'easy']
];
(async()=>{
  const conn = await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD??''});
  try { await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); }
  finally { await conn.end(); }
  const env={...process.env,DB_NAME:dbName};
  const migration=spawnSync(process.execPath,[path.join(__dirname,'run-migrations.js')],{cwd:path.join(__dirname,'..'),env,stdio:'inherit'});
  if(migration.status!==0) throw new Error('Database migrations failed. Existing database was not changed; inspect the output above.');
  process.env.DB_NAME=dbName;
  const db=require('../src/config/database');
  try {
    await db.query("INSERT INTO subjects (slug,name) VALUES ('computer-science','Computer Science') ON DUPLICATE KEY UPDATE name=VALUES(name)");
    const [{id:subjectId}]=await db.query("SELECT id FROM subjects WHERE slug='computer-science'");
    for(let i=0;i<questions.length;i++){
      const [text,options,correctIndex]=questions[i];
      const difficulty=i < 10 ? 'easy' : 'medium';
      const textHash=hash(text);
      let rows=await db.query('SELECT id FROM questions WHERE subject_id=? AND text_hash=?',[subjectId,textHash]);
      let questionId;
      if(rows.length) questionId=rows[0].id;
      else {
        const result=await db.query("INSERT INTO questions (subject_id,question_text,text_hash,difficulty,marks,explanation,source,created_by) VALUES (?,?,?,?,1,?,'manual',NULL)",[subjectId,text,textHash,difficulty,`The correct answer is: ${options[correctIndex]}.`]);
        questionId=result.insertId;
      }
      await db.query('UPDATE questions SET difficulty=? WHERE id=?',[difficulty,questionId]);
      const existing=await db.query('SELECT id FROM question_options WHERE question_id=? LIMIT 1',[questionId]);
      if(!existing.length){
        for(let j=0;j<options.length;j++) await db.query('INSERT INTO question_options (question_id,option_index,option_text,is_correct) VALUES (?,?,?,?)',[questionId,j,options[j],j===correctIndex?1:0]);
      }
    }
    console.log(`\nDemo setup complete. Database: ${dbName}. Subject: Computer Science. Seed questions: ${questions.length} (10 easy, 10 medium; mixed mode supports all 20).`);
    console.log('Your previous database has not been dropped or migrated.');
    // Switch .env only after the isolated demo DB has been created and seeded.
    const envPath=path.join(__dirname,'..','.env');
    if(fs.existsSync(envPath)){
      let content=fs.readFileSync(envPath,'utf8');
      if(/^DB_NAME=.*$/m.test(content)) content=content.replace(/^DB_NAME=.*$/m,`DB_NAME=${dbName}`);
      else content+=`\nDB_NAME=${dbName}\n`;
      fs.writeFileSync(envPath,content);
      console.log(`Updated backend/.env to use ${dbName}.`);
    } else {
      console.log(`No .env file found. Set DB_NAME=${dbName} in backend/.env before starting the server.`);
    }
  } finally { await db.closePool(); }
})().catch(e=>{console.error('\nDemo setup failed:',e.message);process.exitCode=1;});
