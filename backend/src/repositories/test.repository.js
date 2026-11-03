'use strict';
const { query } = require('../config/database');
const BASE = `SELECT t.id, t.title, t.subject_id, t.duration_minutes, 1 AS max_attempts,
  LOWER(t.status) AS status, t.owner_user_id AS created_by, t.created_at,
  LOWER(u.role) AS creator_role, t.question_count AS question_count
  FROM tests t LEFT JOIN users u ON u.id = t.owner_user_id`;
const present = r => r && ({ id:Number(r.id), title:r.title, subjectId:r.subject_id == null ? null : Number(r.subject_id), durationMinutes:Number(r.duration_minutes), maxAttempts:Number(r.max_attempts || 1), status:String(r.status).toLowerCase(), questionCount:Number(r.question_count), createdBy:r.created_by == null ? null : Number(r.created_by), createdAt:r.created_at });
const getRaw = async (id, conn) => (await query(`${BASE} WHERE t.id = ?`, [id], conn))[0] || null;
function canView(user, row) {
  if (!row) return false;
  if (String(user.role).toLowerCase() === 'admin') return true;
  if (String(row.status).toLowerCase() !== 'published') return false;
  return row.created_by == null || Number(row.created_by) === Number(user.id) || String(row.creator_role).toLowerCase() === 'admin';
}
async function list(user, { subjectId, status, limit, offset }) {
  const where=[]; const p=[]; const admin=String(user.role).toLowerCase()==='admin';
  if (!admin) { where.push("UPPER(t.status) = 'PUBLISHED'", '(t.owner_user_id IS NULL OR t.owner_user_id = ? OR UPPER(u.role) = \'ADMIN\')'); p.push(user.id); }
  else if (status) { where.push('UPPER(t.status) = ?'); p.push(String(status).toUpperCase()); }
  if (subjectId) { where.push('t.subject_id = ?'); p.push(subjectId); }
  const w=where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows=await query(`${BASE} ${w} ORDER BY t.id DESC LIMIT ? OFFSET ?`, [...p,limit,offset]);
  const [{n}]=await query(`SELECT COUNT(*) AS n FROM tests t LEFT JOIN users u ON u.id=t.owner_user_id ${w}`,p);
  return {items:rows.map(present),total:Number(n)};
}
async function insert(conn, { title, subjectId, topicId = null, durationMinutes, status = 'draft', userId, questionCount = 10, difficulty = null, sourceType = 'QUESTION_BANK' }) {
  const validCounts=[10,20,30,50];
  const count=validCounts.includes(Number(questionCount)) ? Number(questionCount) : validCounts.reduce((best,n)=>Math.abs(n-Number(questionCount||10))<Math.abs(best-Number(questionCount||10))?n:best,10);
  const duration=[15,30,60].includes(Number(durationMinutes)) ? Number(durationMinutes) : 30;
  const r=await query(`INSERT INTO tests (owner_user_id,title,test_mode,source_type,subject_id,topic_id,difficulty,question_count,duration_minutes,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [userId || null, String(title).slice(0,180), 'PRACTICE', ['QUESTION_BANK','AI_GENERATED','QUESTION_SET','CUSTOM'].includes(sourceType)?sourceType:'QUESTION_BANK', subjectId||null, topicId||null, difficulty && difficulty!=='mixed' ? String(difficulty).toUpperCase() : null, count, duration, String(status).toUpperCase()], conn);
  return r.insertId;
}
async function replaceQuestions(conn, testId, ids) {
  await query('DELETE FROM test_questions WHERE test_id = ?', [testId], conn);
  if (!ids.length) { await query('UPDATE tests SET question_count=10 WHERE id=?', [testId], conn); return; }
  const rows=await query('SELECT id, question_text, correct_option_key, explanation FROM questions WHERE id IN (?)', [ids], conn);
  const byId=new Map(rows.map(r=>[Number(r.id),r]));
  const opts=await query('SELECT question_id, option_key, option_text FROM question_options WHERE question_id IN (?) ORDER BY question_id, option_key', [ids], conn);
  const byQ=new Map(); for(const o of opts){const id=Number(o.question_id);if(!byQ.has(id))byQ.set(id,[]);byQ.get(id).push({key:o.option_key,text:o.option_text});}
  const values=[];
  ids.forEach((id,i)=>{const q=byId.get(Number(id));if(!q) return; const options=byQ.get(Number(id))||[]; values.push([testId,Number(id),i+1,q.question_text,JSON.stringify(options),q.correct_option_key,q.explanation||null,1]);});
  if(values.length) await query('INSERT INTO test_questions (test_id,question_id,display_order,question_text_snapshot,options_snapshot,correct_option_key_snapshot,explanation_snapshot,points) VALUES ?', [values], conn);
  const allowed=[10,20,30,50]; const count=allowed.includes(values.length)?values.length:allowed.reduce((best,n)=>Math.abs(n-values.length)<Math.abs(best-values.length)?n:best,10);
  await query('UPDATE tests SET question_count=? WHERE id=?', [count,testId], conn);
}
async function existingQuestionIds(ids, conn) { if(!ids.length)return []; return (await query('SELECT id FROM questions WHERE id IN (?) AND active=1',[ids],conn)).map(r=>Number(r.id)); }
const setStatus=(id,status)=>query('UPDATE tests SET status=? WHERE id=?',[String(status).toUpperCase(),id]);
async function questionsOf(testId, conn) {
  return query(`SELECT q.id,q.subject_id,q.topic_id,q.question_text,q.difficulty,1 AS marks,q.explanation,
    tq.display_order AS position, q.correct_option_key, ASCII(q.correct_option_key)-ASCII('A') AS correct_index
    FROM test_questions tq JOIN questions q ON q.id=tq.question_id WHERE tq.test_id=? ORDER BY tq.display_order`,[testId],conn);
}
module.exports={present,getRaw,canView,list,insert,replaceQuestions,existingQuestionIds,setStatus,questionsOf};
