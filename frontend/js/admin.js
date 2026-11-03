"use strict";
document.addEventListener('DOMContentLoaded', async () => {
  if (!PrepifyAPI.requireAuth()) return;
  const user = PrepifyAPI.user();
  if (user?.role !== 'admin') { alert('Administrator access is required.'); location.href = 'dashboard.html'; return; }

  const form = document.getElementById('ai-exam-form');
  const subjectSelect = document.getElementById('ai-exam-subject');
  const message = document.getElementById('ai-exam-message');
  const submit = document.getElementById('ai-exam-submit');
  const localValue = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const start = new Date(Date.now() + 10 * 60 * 1000);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const startsInput = document.getElementById('ai-exam-starts');
  const endsInput = document.getElementById('ai-exam-ends');
  if (startsInput && !startsInput.value) startsInput.value = localValue(start);
  if (endsInput && !endsInput.value) endsInput.value = localValue(end);

  try {
    const [stats, subjects, questions, exams] = await Promise.all([
      PrepifyAPI.get('/admin/stats'), PrepifyAPI.get('/subjects'),
      PrepifyAPI.get('/questions?page=1&limit=1'), PrepifyAPI.get('/exams?page=1&limit=1')
    ]);
    const cards = document.querySelectorAll('.admin-stat-card h2');
    if (cards[0]) cards[0].textContent = String(stats.questions ?? questions.total ?? '—');
    if (cards[1]) cards[1].textContent = String(subjects.items?.length ?? '—');
    if (cards[2]) cards[2].textContent = String(exams.total ?? exams.items?.length ?? '—');
    const items = Array.isArray(subjects) ? subjects : (subjects.items || subjects.subjects || []);
    if (subjectSelect) {
      subjectSelect.replaceChildren(new Option('Select a subject', ''));
      items.forEach((item) => subjectSelect.add(new Option(item.name, String(item.id))));
      if (!items.length) subjectSelect.add(new Option('No subjects configured', ''));
    }
  } catch (e) {
    const p = document.createElement('p'); p.setAttribute('role', 'alert'); p.textContent = e.message;
    document.querySelector('.admin-heading')?.appendChild(p);
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!message || !submit) return;
    message.textContent = '';
    const data = new FormData(form);
    const startsAt = new Date(String(data.get('startsAt')));
    const endsAt = new Date(String(data.get('endsAt')));
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      message.textContent = 'Choose a valid start and end time; the end must be after the start.'; return;
    }
    if (endsAt <= new Date()) { message.textContent = 'The examination must end in the future.'; return; }
    submit.disabled = true; submit.textContent = 'Generating exam with AI…';
    try {
      let syllabusText = '';
      const pdf = document.getElementById('ai-exam-pdf')?.files?.[0];
      if (pdf) {
        if (!pdf.name.toLowerCase().endsWith('.pdf') || pdf.size > 10 * 1024 * 1024) throw new Error('Choose a PDF smaller than 10 MB.');
        const upload = new FormData(); upload.append('syllabus', pdf);
        const token = localStorage.getItem('prepifyToken') || sessionStorage.getItem('prepifyToken');
        const response = await fetch(`${PrepifyAPI.base}/syllabus/extract`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: upload });
        const payload = await response.json();
        if (!response.ok || payload?.success === false) throw new Error(payload?.error?.message || 'Could not extract text from the PDF.');
        syllabusText = payload?.data?.text || payload?.text || '';
      }
      const body = {
        title: String(data.get('title')).trim(), subjectId: Number(data.get('subjectId')),
        difficulty: String(data.get('difficulty')), count: Number(data.get('count')),
        durationMinutes: Number(data.get('durationMinutes')),
        startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString()
      };
      const topic = String(data.get('topic') || '').trim();
      if (topic) body.topic = topic;
      if (syllabusText) body.syllabusText = syllabusText;
      const exam = await PrepifyAPI.post('/exams/ai', body);
      message.textContent = `Exam created successfully. Join code: ${exam.examCode}. Questions: ${exam.questionCount}. Share this code with students. The published paper is fixed for all participants.`;
      form.reset();
      if (subjectSelect) subjectSelect.value = '';
      startsInput.value = localValue(new Date(Date.now() + 10 * 60 * 1000));
      endsInput.value = localValue(new Date(Date.now() + 70 * 60 * 1000));
      submit.textContent = 'Generate and schedule exam';
    } catch (e) {
      message.textContent = e.message || 'Could not create the examination.';
      submit.textContent = 'Generate and schedule exam';
    } finally { submit.disabled = false; }
  });


  // Admin content management actions. These are deliberately confined to admin.js
  // and use the existing API routes; no other frontend page or styling is changed.
  const openPanel = (title, contentNode) => {
    document.getElementById('admin-content-dialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'admin-content-dialog';
    dialog.className = 'admin-content-dialog';
    const heading = document.createElement('h2');
    heading.textContent = title;
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'btn btn-secondary'; close.textContent = 'Close';
    close.addEventListener('click', () => dialog.close());
    const top = document.createElement('div'); top.className = 'admin-dialog-top';
    top.append(heading, close);
    dialog.append(top, contentNode);
    document.body.append(dialog);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal();
    return dialog;
  };
  const el = (tag, props = {}, text = '') => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  };
  const showError = (container, error) => {
    const p = el('p', { role: 'alert' }, error?.message || 'Request failed.');
    container.prepend(p);
  };

  document.getElementById('manage-subjects-btn')?.addEventListener('click', async () => {
    const panel = el('div', { class: 'admin-dialog-content' });
    const status = el('p', { role: 'status', 'aria-live': 'polite' });
    const list = el('div', { class: 'admin-dialog-list' });
    const form = el('form', { class: 'admin-dialog-form' });
    const name = el('input', { name: 'name', required: '', minlength: '2', maxlength: '150', placeholder: 'Subject name' });
    const slug = el('input', { name: 'slug', required: '', pattern: '[a-z0-9]+(-[a-z0-9]+)*', maxlength: '80', placeholder: 'subject-slug' });
    name.addEventListener('input', () => { if (!slug.dataset.edited) slug.value = name.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
    slug.addEventListener('input', () => { slug.dataset.edited = '1'; });
    form.append(el('label', {}, 'Subject name'), name, el('label', {}, 'Slug'), slug, el('button', { type: 'submit', class: 'btn btn-primary' }, 'Add subject'));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); status.textContent = '';
      try {
        await PrepifyAPI.post('/subjects', { name: name.value.trim(), slug: slug.value.trim() });
        status.textContent = 'Subject added.';
        name.value = ''; slug.value = ''; delete slug.dataset.edited;
        await loadSubjects();
      } catch (error) { showError(panel, error); }
    });
    const loadSubjects = async () => {
      list.replaceChildren();
      try {
        const result = await PrepifyAPI.get('/subjects');
        const items = Array.isArray(result) ? result : (result.items || result.subjects || []);
        if (!items.length) list.append(el('p', {}, 'No subjects found.'));
        for (const subject of items) {
          const row = el('div', { class: 'admin-dialog-row' });
          row.append(el('strong', {}, subject.name));
          const topicButton = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Manage topics');
          topicButton.addEventListener('click', async () => {
            const topicBox = el('div', { class: 'admin-dialog-content' });
            const topicList = el('div', { class: 'admin-dialog-list' });
            const topicForm = el('form', { class: 'admin-dialog-form' });
            const topicInput = el('input', { name: 'name', required: '', minlength: '2', maxlength: '150', placeholder: 'Topic name' });
            topicForm.append(el('label', {}, `Add topic to ${subject.name}`), topicInput, el('button', { type: 'submit', class: 'btn btn-primary' }, 'Add topic'));
            const refreshTopics = async () => {
              topicList.replaceChildren();
              try {
                const data = await PrepifyAPI.get(`/subjects/${subject.id}/topics`);
                const topics = Array.isArray(data) ? data : (data.items || []);
                if (!topics.length) topicList.append(el('p', {}, 'No topics yet.'));
                topics.forEach(t => topicList.append(el('p', {}, t.name)));
              } catch (error) { showError(topicBox, error); }
            };
            topicForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              try { await PrepifyAPI.post(`/subjects/${subject.id}/topics`, { name: topicInput.value.trim() }); topicInput.value = ''; await refreshTopics(); }
              catch (error) { showError(topicBox, error); }
            });
            topicBox.append(topicForm, topicList);
            openPanel(`Topics — ${subject.name}`, topicBox);
            await refreshTopics();
          });
          row.append(topicButton); list.append(row);
        }
      } catch (error) { showError(panel, error); }
    };
    panel.append(form, status, list);
    openPanel('Manage subjects and topics', panel);
    await loadSubjects();
  });

  document.getElementById('manage-questions-btn')?.addEventListener('click', async () => {
    const panel = el('div', { class: 'admin-dialog-content' });
    const filters = el('form', { class: 'admin-dialog-form' });
    const subject = el('select', { name: 'subjectId' });
    subject.append(new Option('All subjects', ''));
    try {
      const data = await PrepifyAPI.get('/subjects');
      (Array.isArray(data) ? data : (data.items || data.subjects || [])).forEach(s => subject.add(new Option(s.name, s.id)));
    } catch (error) { showError(panel, error); }
    const search = el('input', { name: 'search', placeholder: 'Search questions' });
    const refresh = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Search');
    filters.append(el('label', {}, 'Subject'), subject, el('label', {}, 'Search'), search, refresh);
    const list = el('div', { class: 'admin-dialog-list' });
    const load = async () => {
      list.replaceChildren(el('p', {}, 'Loading questions…'));
      try {
        const params = new URLSearchParams({ page: '1', limit: '50' });
        if (subject.value) params.set('subjectId', subject.value);
        if (search.value.trim()) params.set('search', search.value.trim());
        const data = await PrepifyAPI.get(`/questions?${params}`);
        const items = data.items || [];
        list.replaceChildren();
        if (!items.length) list.append(el('p', {}, 'No questions found. Questions are generated by AI during practice/exam creation.'));
        items.forEach(q => {
          const row = el('article', { class: 'admin-dialog-question' });
          row.append(el('strong', {}, q.questionText || 'Question'));
          row.append(el('p', {}, `Difficulty: ${q.difficulty || '—'} · ID: ${q.id}`));
          if (q.explanation) row.append(el('p', {}, q.explanation));
          const del = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Delete');
          del.addEventListener('click', async () => {
            if (!confirm('Delete this question? Existing published exam snapshots should remain unchanged.')) return;
            try { await PrepifyAPI.del(`/questions/${q.id}`); await load(); }
            catch (error) { showError(panel, error); }
          });
          row.append(del); list.append(row);
        });
      } catch (error) { list.replaceChildren(); showError(panel, error); }
    };
    filters.addEventListener('submit', async e => { e.preventDefault(); await load(); });
    panel.append(filters, list);
    openPanel('Manage questions', panel);
    await load();
  });

  document.getElementById('manage-exams-btn')?.addEventListener('click', async () => {
    const panel = el('div', { class: 'admin-dialog-content' });
    const list = el('div', { class: 'admin-dialog-list' });
    const refresh = el('button', { type: 'button', class: 'btn btn-primary' }, 'Refresh examinations');
    const load = async () => {
      list.replaceChildren(el('p', {}, 'Loading examinations…'));
      try {
        const data = await PrepifyAPI.get('/exams?page=1&limit=50');
        const items = data.items || [];
        list.replaceChildren();
        if (!items.length) list.append(el('p', {}, 'No examinations scheduled yet. Use the AI exam form on this page to create one.'));
        items.forEach(exam => {
          const row = el('article', { class: 'admin-dialog-question' });
          row.append(el('strong', {}, exam.title || `Exam ${exam.id}`));
          row.append(el('p', {}, `Join code: ${exam.examCode || exam.code || '—'} · Status: ${exam.phase || exam.status || '—'}`));
          row.append(el('p', {}, `Starts: ${exam.startsAt || '—'} · Ends: ${exam.endsAt || '—'}`));
          if ((exam.phase || exam.status) !== 'cancelled' && (exam.status || '').toLowerCase() !== 'cancelled') {
            const cancel = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel examination');
            cancel.addEventListener('click', async () => {
              if (!confirm('Cancel this examination?')) return;
              try { await PrepifyAPI.post(`/exams/${exam.id}/cancel`, {}); await load(); }
              catch (error) { showError(panel, error); }
            });
            row.append(cancel);
          }
          list.append(row);
        });
      } catch (error) { list.replaceChildren(); showError(panel, error); }
    };
    refresh.addEventListener('click', load);
    panel.append(refresh, list);
    openPanel('Manage college examinations', panel);
    await load();
  });

});
