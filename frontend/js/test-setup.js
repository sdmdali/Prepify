"use strict";

(() => {
  const form = document.getElementById("test-setup-form");
  if (!form) return;

  const subject = document.getElementById("subject");
  const topics = document.getElementById("topics");
  const fileInput = document.getElementById("syllabus-file");
  const uploadTitle = document.getElementById("upload-title");
  const uploadSubtitle = document.getElementById("upload-subtitle");
  const sourceError = document.getElementById("source-error");
  const mixedNote = document.getElementById("mixed-note");
  const countSelect = document.getElementById("question-count");
  const durationSelect = document.getElementById("duration");
  const summaryCount = document.getElementById("summary-count");
  const summaryDetail = document.getElementById("summary-detail");
  const startButton = document.getElementById("start-practice-btn");
  const syllabusOption = document.getElementById("syllabus-option");
  const topicOption = document.getElementById("topic-option");

  // Maps subject names to real numeric database IDs.
  const subjectIdByName = new Map();

  const difficulty = () =>
    form.querySelector('input[name="difficulty"]:checked')?.value || "mixed";

  function showError(message) {
    if (sourceError) {
      sourceError.textContent = message;
      sourceError.hidden = false;
      sourceError.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    } else {
      alert(message);
    }
  }

  function clearError() {
    if (sourceError) {
      sourceError.textContent = "";
      sourceError.hidden = true;
    }
  }

  function summary() {
    const level = difficulty();

    // Allow every question count supported by the existing dropdown.
    if (countSelect) {
      [...countSelect.options].forEach((option) => {
        option.disabled = false;
      });
    }

    if (summaryCount) {
      summaryCount.textContent = `${Number(countSelect?.value) || 10} questions`;
    }

    if (summaryDetail) {
      summaryDetail.textContent = `${level} difficulty · ${Number(durationSelect?.value) || 30} minutes`;
    }

    if (mixedNote) {
      mixedNote.hidden = level !== "mixed";
    }
  }

  function sourceCards() {
    if (syllabusOption) {
      syllabusOption.classList.toggle("is-active", !!fileInput?.files?.[0]);
    }

    if (topicOption) {
      topicOption.classList.toggle("is-active", !!topics?.value.trim());
    }
  }

  // Preserve existing options and add subjects returned by the API.
  async function loadSubjects() {
    if (!subject) return;

    // Keep all original options, including category-related subjects.
    [...subject.options].forEach((option) => {
      const id = Number(option.value);

      if (option.value && Number.isSafeInteger(id) && id > 0) {
        subjectIdByName.set(option.textContent.trim().toLowerCase(), id);
      }
    });

    try {
      const response = await PrepifyAPI.get("/subjects");

      const items = Array.isArray(response)
        ? response
        : response?.items || response?.subjects || [];

      items.forEach((item) => {
        const id = Number(item?.id);
        const name = String(item?.name || "").trim();

        if (!name || !Number.isSafeInteger(id) || id <= 0) {
          return;
        }

        const normalizedName = name.toLowerCase();

        subjectIdByName.set(normalizedName, id);

        // Update an existing option instead of removing it.
        let existing = [...subject.options].find(
          (option) =>
            option.textContent.trim().toLowerCase() === normalizedName,
        );

        if (existing) {
          existing.value = String(id);
          existing.dataset.databaseSubjectId = String(id);
          return;
        }

        const option = document.createElement("option");
        option.value = String(id);
        option.textContent = name;
        option.dataset.databaseSubjectId = String(id);
        subject.appendChild(option);
      });

      // Keep the existing dropdown selection if possible.
      const selectedName = subject.selectedOptions[0]?.textContent
        .trim()
        .toLowerCase();

      if (selectedName && subjectIdByName.has(selectedName)) {
        subject.value = String(subjectIdByName.get(selectedName));
      }
    } catch (err) {
      // Do not delete existing options if the API request fails.
      console.error("Could not load subjects from API:", err);
    }
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      clearError();
      const file = fileInput.files?.[0];
      if (file) {
        if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 10 * 1024 * 1024) {
          fileInput.value = "";
          showError("Choose a PDF syllabus smaller than 10 MB.");
          if (uploadTitle) uploadTitle.textContent = "Choose a PDF file";
          if (uploadSubtitle) uploadSubtitle.textContent = "PDF only · Maximum 10 MB";
        } else {
          if (uploadTitle) uploadTitle.textContent = file.name;
          if (uploadSubtitle) uploadSubtitle.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · Ready to process`;
        }
      } else {
        if (uploadTitle) uploadTitle.textContent = "Choose a PDF file";
        if (uploadSubtitle) uploadSubtitle.textContent = "PDF only · Maximum 10 MB";
      }
      sourceCards();
    });
  }

  async function extractSyllabusPdf(file) {
    const formData = new FormData();
    formData.append("syllabus", file);
    const token = localStorage.getItem("prepifyToken") || sessionStorage.getItem("prepifyToken");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    let response;
    try {
      response = await fetch(`${PrepifyAPI.base}/syllabus/extract`, { method: "POST", headers, body: formData });
    } catch (_) {
      throw new Error("Cannot reach Prepify backend. Make sure the backend is running.");
    }
    let payload;
    try { payload = await response.json(); } catch (_) { throw new Error(`PDF processing failed (${response.status}).`); }
    if (!response.ok || payload?.success === false) throw new Error(payload?.error?.message || "Could not read the syllabus PDF.");
    return payload?.data?.text || payload?.text || "";
  }

  topics?.addEventListener("input", () => {
    clearError();
    sourceCards();
  });

  form.querySelectorAll('input[name="difficulty"]').forEach((input) => {
    input.addEventListener("change", summary);
  });

  countSelect?.addEventListener("change", summary);
  durationSelect?.addEventListener("change", summary);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!PrepifyAPI.requireAuth()) return;

    const selectedOption = subject?.selectedOptions?.[0];
    const selectedName = selectedOption?.textContent.trim().toLowerCase();
    const syllabusFile = fileInput?.files?.[0];
    const hasSubjectSelection = !!subject?.value;

    // A PDF is an independent source. Subject selection is required only
    // when the student is not uploading a syllabus.
    if (!hasSubjectSelection && !syllabusFile) {
      showError("Choose a subject or upload a syllabus PDF.");
      return;
    }

    let subjectId = null;
    if (hasSubjectSelection) {
      subjectId = Number(
        selectedOption?.dataset.databaseSubjectId || subject.value,
      );
      if (!Number.isSafeInteger(subjectId) || subjectId <= 0) {
        subjectId = subjectIdByName.get(selectedName);
      }
      if (!Number.isSafeInteger(subjectId) || subjectId <= 0) {
        showError(
          `No valid database ID was found for "${selectedOption?.textContent.trim()}". ` +
            "This subject must exist in the backend before a test can be generated.",
        );
        return;
      }
    }

    if (!form.reportValidity()) return;

    const questionCount = Number(countSelect?.value);
    const durationMinutes = Number(durationSelect?.value);

    if (![10, 20, 30, 50].includes(questionCount)) {
      showError("Please select a supported question count.");
      return;
    }

    if (![15, 30, 60].includes(durationMinutes)) {
      showError("Please select a supported test duration.");
      return;
    }

    clearError();

    const originalButton = startButton?.innerHTML;

    if (startButton) {
      startButton.disabled = true;
      startButton.textContent = "Preparing test...";
    }

    try {
      const selectedTopic = String(topics?.value || "").trim();
      let syllabusText = "";
      if (syllabusFile) {
        if (startButton) startButton.textContent = "Reading syllabus PDF...";
        syllabusText = await extractSyllabusPdf(syllabusFile);
        if (syllabusText.length < 100) throw new Error("Not enough readable syllabus text was found in this PDF.");
      }
      const settings = {
        ...(subjectId ? { subjectId } : {}),
        topic: selectedTopic,
        topicIds: [],
        ...(syllabusText ? { syllabusText } : {}),
        difficulty: difficulty(),
        questionCount,
        durationMinutes,
      };

      const created = await PrepifyAPI.post("/tests/practice", settings);

      const testId = created?.test?.id ?? created?.id ?? created?.testId;

      if (!testId) {
        throw new Error("Backend did not return a test ID.");
      }

      const attemptResponse = await PrepifyAPI.post(
        `/tests/${testId}/attempts`,
        {},
      );

      const attempt = attemptResponse?.attempt || attemptResponse;

      if (!attempt?.id) {
        throw new Error("Backend did not return a valid test attempt.");
      }

      sessionStorage.setItem(
        "prepifyActiveAttempt",
        JSON.stringify({
          attemptId: attempt.id,
          testId,
          deadlineAt: attempt.deadlineAt,
          questions: attemptResponse?.questions || [],
          answers: attemptResponse?.answers || {},
          settings: {
            ...settings,
            subjectLabel:
              selectedOption?.textContent.trim() ||
              topics?.value ||
              (syllabusFile ? syllabusFile.name : "Practice Test"),
          },
        }),
      );

      window.location.href = "test.html";
    } catch (err) {
      console.error("Failed to start practice test:", err);
      PrepifyAPI.message(err);
    } finally {
      if (startButton) {
        startButton.disabled = false;
        startButton.innerHTML = originalButton || "Start Practice Test";
      }
    }
  });

  summary();
  sourceCards();
  loadSubjects();
})();
