const loginForm = document.querySelector("#studentLoginForm");
const loginButton = document.querySelector("#loginButton");
const loginMessage = document.querySelector("#loginMessage");

const classNumberInput = document.querySelector("#classNumber");
const studentNumberInput = document.querySelector("#studentNumber");
const generatedNicknameElement = document.querySelector("#generatedNickname");

const STORAGE_KEY = "mathTutoringStudentSession";

// 이후 실제 문제풀이 화면 파일명이 정해지면 수정하세요.
const NEXT_PAGE_URL = "./tutor.html";

// 아직 다음 페이지가 없으면 false로 두세요.
const REDIRECT_AFTER_LOGIN = false;

function showMessage(message, type = "info") {
  loginMessage.textContent = message;
  loginMessage.className = `login-message ${type}`;
}

function setLoading(isLoading) {
  loginButton.disabled = isLoading;
  loginButton.textContent = isLoading ? "로그인 중..." : "로그인하고 시작하기";
}

function sanitizePositiveInteger(value) {
  const trimmed = String(value).trim();

  if (!trimmed) return "";

  const numericValue = Number(trimmed);

  if (!Number.isInteger(numericValue) || numericValue < 1) {
    return "";
  }

  return String(numericValue);
}

function buildStudentNickname(classNumber, studentNumber) {
  if (!classNumber || !studentNumber) {
    return "math반-번호";
  }

  return `math${classNumber}-${studentNumber}`;
}

function updateGeneratedNickname() {
  const classNumber = sanitizePositiveInteger(classNumberInput.value);
  const studentNumber = sanitizePositiveInteger(studentNumberInput.value);

  const nickname = buildStudentNickname(classNumber, studentNumber);
  generatedNicknameElement.textContent = nickname;
}

function createStudentSession({ classNumber, studentNumber, studentNickname }) {
  return {
    classNumber,
    studentNumber,
    studentNickname,
    loginAt: new Date().toISOString(),
    sessionId: crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`
  };
}

function saveStudentSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function restorePreviousSession() {
  const savedSession = localStorage.getItem(STORAGE_KEY);

  if (!savedSession) {
    updateGeneratedNickname();
    return;
  }

  try {
    const session = JSON.parse(savedSession);

    if (session.classNumber) {
      classNumberInput.value = session.classNumber;
    }

    if (session.studentNumber) {
      studentNumberInput.value = session.studentNumber;
    }

    updateGeneratedNickname();
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    updateGeneratedNickname();
  }
}

function handleLoginSubmit(event) {
  event.preventDefault();

  const classNumber = sanitizePositiveInteger(classNumberInput.value);
  const studentNumber = sanitizePositiveInteger(studentNumberInput.value);

  showMessage("");

  if (!classNumber) {
    showMessage("반을 올바르게 입력해 주세요.", "error");
    classNumberInput.focus();
    return;
  }

  if (!studentNumber) {
    showMessage("번호를 올바르게 입력해 주세요.", "error");
    studentNumberInput.focus();
    return;
  }

  const studentNickname = buildStudentNickname(classNumber, studentNumber);

  setLoading(true);

  const studentSession = createStudentSession({
    classNumber,
    studentNumber,
    studentNickname
  });

  saveStudentSession(studentSession);

  showMessage(`로그인이 완료되었습니다. 닉네임: ${studentNickname}`, "success");

  console.log("Student session saved:", studentSession);

  setTimeout(() => {
    setLoading(false);

    if (REDIRECT_AFTER_LOGIN) {
      window.location.href = NEXT_PAGE_URL;
    }
  }, 700);
}

classNumberInput.addEventListener("input", updateGeneratedNickname);
studentNumberInput.addEventListener("input", updateGeneratedNickname);
loginForm.addEventListener("submit", handleLoginSubmit);

restorePreviousSession();