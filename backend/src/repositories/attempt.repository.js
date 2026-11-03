'use strict';
const { query } = require('../config/database');
const statusIn = s => ({in_progress:'IN_PROGRESS',submitted:'SUBMITTED',expired:'EXPIRED'}[String(s).toLowerCase()] || String(s).toUpperCase());
const lockUser=(userId,conn)=>query('SELECT id FROM users WHERE id=? FOR UPDATE',[userId],conn);
const selectAttempt = `SELECT a.*, LOWER(a.status) AS status, a.expires_at AS deadline_at, a.exam_session_id FROM test_attempts a`;
const lockAttempt=async(id,conn)=>(await query(`${selectAttempt} WHERE a.id=? FOR UPDATE`,[id],conn))[0]||null;
const getAttempt=async(id,conn)=>(await query(`${selectAttempt} WHERE a.id=?`,[id],conn))[0]||null;
const findOpen=async(testId,userId,examId,conn)=>(await query(`${selectAttempt} WHERE a.test_id=? AND a.user_id=? AND (a.exam_session_id <=> ? OR (? IS NOT NULL AND a.exam_session_id IS NULL)) AND UPPER(a.status)='IN_PROGRESS' ORDER BY a.id DESC LIMIT 1`,[testId,userId,examId ?? null,examId ?? null],conn))[0]||null;
const countFor=async(testId,userId,examId,conn)=>Number((await query('SELECT COUNT(*) AS n FROM test_attempts WHERE test_id=? AND user_id=? AND (exam_session_id <=> ? OR (? IS NOT NULL AND exam_session_id IS NULL))',[testId,userId,examId ?? null,examId ?? null],conn))[0].n);
async function insert(conn,{testId,userId,examId=null,number,startedAt,deadlineAt}) {
 const testRows=await query('SELECT question_count FROM tests WHERE id=?',[testId],conn);
 const count=Number(testRows[0]?.question_count)||10;
 const r=await query(`INSERT INTO test_attempts (test_id,user_id,exam_session_id,attempt_number,status,started_at,expires_at,max_score) VALUES (?,?,?,?,'IN_PROGRESS',?,?,?)`,[testId,userId,examId ?? null,number,startedAt || new Date().toISOString().slice(0,19).replace('T',' '),deadlineAt,count],conn);
 return r.insertId;
}
const answersOf=(attemptId,conn)=>query(`SELECT tq.question_id, CASE WHEN sa.selected_option_key IS NULL THEN NULL ELSE ASCII(sa.selected_option_key)-ASCII('A') END AS selected_option_index
 FROM student_answers sa JOIN test_questions tq ON tq.id=sa.test_question_id WHERE sa.attempt_id=?`,[attemptId],conn);
const upsertAnswer=(conn,attemptId,questionId,idx,at)=>{
 const key=idx===null||idx===undefined?null:String.fromCharCode(65+Number(idx));
 return query(`INSERT INTO student_answers (attempt_id,test_question_id,selected_option_key) SELECT ?,tq.id,? FROM test_questions tq JOIN test_attempts a ON a.test_id=tq.test_id WHERE a.id=? AND tq.question_id=? ON DUPLICATE KEY UPDATE selected_option_key=VALUES(selected_option_key), answered_at=CURRENT_TIMESTAMP(6)`,[attemptId,key,attemptId,questionId],conn);
};
const optionCounts=async(testId,conn)=>{const rows=await query(`SELECT tq.question_id,COUNT(o.id) AS n FROM test_questions tq LEFT JOIN question_options o ON o.question_id=tq.question_id WHERE tq.test_id=? GROUP BY tq.question_id`,[testId],conn);return new Map(rows.map(r=>[Number(r.question_id),Number(r.n)]));};
async function finalize(conn,{attemptId,status,at,score,maxScore,perQuestion}) {
 const qs=await query(`SELECT COUNT(*) AS total, SUM(CASE WHEN sa.selected_option_key IS NULL THEN 1 ELSE 0 END) AS unanswered,
 SUM(CASE WHEN sa.selected_option_key=q.correct_option_key THEN 1 ELSE 0 END) AS correct,
 SUM(CASE WHEN sa.selected_option_key IS NOT NULL AND sa.selected_option_key<>q.correct_option_key THEN 1 ELSE 0 END) AS incorrect
 FROM test_attempts a JOIN test_questions tq ON tq.test_id=a.test_id JOIN questions q ON q.id=tq.question_id
 LEFT JOIN student_answers sa ON sa.test_question_id=tq.id AND sa.attempt_id=a.id WHERE a.id=?`,[attemptId],conn);
 const c=qs[0]||{};
 await query(`UPDATE test_attempts SET status=?,submitted_at=?,score=?,max_score=?,correct_count=?,incorrect_count=?,unanswered_count=? WHERE id=? AND UPPER(status)='IN_PROGRESS'`,[statusIn(status),at,score,maxScore,Number(c.correct||0),Number(c.incorrect||0),Number(c.unanswered??c.total??0),attemptId],conn);
}
const staleOpenForUser=(userId,nowSql)=>query(`SELECT id FROM test_attempts WHERE user_id=? AND UPPER(status)='IN_PROGRESS' AND expires_at < ?`,[userId,nowSql]);
async function history(userId,{limit,offset}) {
 const rows=await query(`SELECT a.id,a.test_id,NULL AS exam_session_id,a.attempt_number,LOWER(a.status) AS status,a.started_at,a.submitted_at,a.score,a.max_score,t.title FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE a.user_id=? AND UPPER(a.status)<>'IN_PROGRESS' ORDER BY a.id DESC LIMIT ? OFFSET ?`,[userId,limit,offset]);
 const [{n}]=await query(`SELECT COUNT(*) AS n FROM test_attempts WHERE user_id=? AND UPPER(status)<>'IN_PROGRESS'`,[userId]); return {rows,total:Number(n)};
}
const reviewRows=(attemptId,testId)=>query(`SELECT q.id,q.question_text,q.explanation,1 AS marks,tq.display_order AS position,
 CASE WHEN sa.selected_option_key IS NULL THEN NULL ELSE ASCII(sa.selected_option_key)-ASCII('A') END AS selected_option_index,
 CASE WHEN sa.selected_option_key IS NULL THEN NULL WHEN sa.selected_option_key=q.correct_option_key THEN 1 ELSE 0 END AS is_correct,
 CASE WHEN sa.selected_option_key=q.correct_option_key THEN 1 ELSE 0 END AS marks_awarded
 FROM test_questions tq JOIN questions q ON q.id=tq.question_id LEFT JOIN student_answers sa ON sa.test_question_id=tq.id AND sa.attempt_id=? WHERE tq.test_id=? ORDER BY tq.display_order`,[attemptId,testId]);
module.exports={lockUser,lockAttempt,getAttempt,findOpen,countFor,insert,answersOf,upsertAnswer,optionCounts,finalize,staleOpenForUser,history,reviewRows};
