import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "firebase/firestore";

import { firebaseConfig } from "./firebaseConfig.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

const STORAGE_KEY = "mathTutoringStudentSession";
const PROBLEM_ID = "problem1";

const studentNicknameText = document.querySelector("#studentNicknameText");
const problemTextElement = document.querySelector("#problemText");

const confidenceForm = document.querySelector("#confidenceForm");
const initialConfidenceInput = document.querySelector("#initialConfidenceInput");
const confidenceButton = document.querySelector("#confidenceButton");
const confidenceMessage = document.querySelector("#confidenceMessage");
const confidenceStatus = document.querySelector("#confidenceStatus");

const answerForm = document.querySelector("#answerForm");
const finalAnswerInput = document.querySelector("#finalAnswerInput");
const answerButton = document.querySelector("#answerButton");
const answerMessage = document.querySelector("#answerMessage");
const answerStatus = document.querySelector("#answerStatus");

const solutionForm = document.querySelector("#solutionForm");
const studentInput = document.querySelector("#studentInput");
const submitButton = document.querySelector("#submitButton");
const submitMessage = document.querySelector("#submitMessage");

const probabilityGauge = document.querySelector("#probabilityGauge");
const probabilityValue = document.querySelector("#probabilityValue");

const historyButton = document.querySelector("#historyButton");
const closeHistoryButton = document.querySelector("#closeHistoryButton");
const historyDrawer = document.querySelector("#historyDrawer");
const drawerOverlay = document.querySelector("#drawerOverlay");
const historyList = document.querySelector("#historyList");

let currentStudentSession = null;
let currentProblemText = "";
let currentHistoryCount = 0;
let currentInitialConfidencePercent = null;
let currentFinalAnswerText = null;
let currentDisplayedProbability = 0;
let gaugeAnimationFrame = null;

function getStudentSession() {
  const savedSession = localStorage.getItem(STORAGE_KEY);

  if (!savedSession) {
    return null;
  }

  try {
    return JSON.parse(savedSession);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function showSubmitMessage(message, type = "info") {
  submitMessage.textContent = message;
  submitMessage.className = `submit-message ${type}`;
}

function showConfidenceMessage(message, type = "info") {
  confidenceMessage.textContent = message;
  confidenceMessage.className = `confidence-message ${type}`;
}

function showAnswerMessage(message, type = "info") {
  answerMessage.textContent = message;
  answerMessage.className = `answer-message ${type}`;
}

function setSubmitting(isSubmitting) {
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? "정답 가능성 계산 중..." : "풀이 제출하기";
}

function setConfidenceSaving(isSaving) {
  confidenceButton.disabled = isSaving;
  confidenceButton.textContent = isSaving ? "저장 중..." : "저장";
}

function setAnswerSaving(isSaving) {
  answerButton.disabled = isSaving;
  answerButton.textContent = isSaving ? "저장 중..." : "저장";
}

function getConfidenceValue(value) {
  const trimmedValue = String(value).trim();

  if (!trimmedValue) {
    return null;
  }

  const numberValue = Number(trimmedValue);

  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > 100) {
    return null;
  }

  return numberValue;
}

function getFinalAnswerValue(value) {
  const answerText = String(value).trim();

  if (!answerText) {
    return "";
  }

  return answerText;
}

function lockConfidenceInput(confidencePercent) {
  currentInitialConfidencePercent = confidencePercent;

  initialConfidenceInput.value = String(confidencePercent);
  initialConfidenceInput.disabled = true;

  confidenceButton.disabled = true;
  confidenceButton.textContent = "저장 완료";

  confidenceStatus.textContent = "잠김";
  confidenceStatus.classList.add("locked");

  showConfidenceMessage("자신감이 저장되었습니다. 이 값은 다시 수정할 수 없습니다.", "success");
}

function unlockConfidenceInput() {
  currentInitialConfidencePercent = null;

  initialConfidenceInput.disabled = false;
  confidenceButton.disabled = false;
  confidenceButton.textContent = "저장";

  confidenceStatus.textContent = "입력 전";
  confidenceStatus.classList.remove("locked");

  showConfidenceMessage("문제를 풀기 전에 현재 자신감을 0~100 사이로 입력해 주세요.", "info");
}

function lockFinalAnswerInput(answerText) {
  currentFinalAnswerText = answerText;

  finalAnswerInput.value = answerText;
  finalAnswerInput.disabled = true;

  answerButton.disabled = true;
  answerButton.textContent = "저장 완료";

  answerStatus.textContent = "잠김";
  answerStatus.classList.add("locked");

  showAnswerMessage("최종 정답이 저장되었습니다. 이 값은 다시 수정할 수 없습니다.", "success");
}

function unlockFinalAnswerInput() {
  currentFinalAnswerText = null;

  finalAnswerInput.disabled = false;
  answerButton.disabled = false;
  answerButton.textContent = "저장";

  answerStatus.textContent = "입력 전";
  answerStatus.classList.remove("locked");

  showAnswerMessage("최종 정답은 한 번 저장하면 다시 수정할 수 없습니다.", "info");
}

async function loadStudentProblemState() {
  const studentDocRef = doc(db, "student", currentStudentSession.studentNickname);
  const studentSnap = await getDoc(studentDocRef);

  if (!studentSnap.exists()) {
    unlockConfidenceInput();
    unlockFinalAnswerInput();
    return;
  }

  const studentData = studentSnap.data();

  const savedConfidence =
    studentData.initialConfidenceByProblem?.[PROBLEM_ID]?.confidencePercent;

  const savedFinalAnswer =
    studentData.finalAnswerByProblem?.[PROBLEM_ID]?.answerText;

  if (Number.isInteger(savedConfidence) && savedConfidence >= 0 && savedConfidence <= 100) {
    lockConfidenceInput(savedConfidence);
  } else {
    unlockConfidenceInput();
  }

  if (typeof savedFinalAnswer === "string" && savedFinalAnswer.trim()) {
    lockFinalAnswerInput(savedFinalAnswer.trim());
  } else {
    unlockFinalAnswerInput();
  }
}

async function saveInitialConfidence(confidencePercent) {
  const studentDocRef = doc(db, "student", currentStudentSession.studentNickname);

  await setDoc(
    studentDocRef,
    {
      initialConfidenceByProblem: {
        [PROBLEM_ID]: {
          confidencePercent,
          locked: true,
          lockedAt: serverTimestamp(),
          lockedAtLocal: new Date().toISOString()
        }
      },
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

async function saveFinalAnswer(answerText) {
  const studentDocRef = doc(db, "student", currentStudentSession.studentNickname);

  await setDoc(
    studentDocRef,
    {
      finalAnswerByProblem: {
        [PROBLEM_ID]: {
          answerText,
          locked: true,
          lockedAt: serverTimestamp(),
          lockedAtLocal: new Date().toISOString()
        }
      },
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

async function handleConfidenceSubmit(event) {
  event.preventDefault();

  if (currentInitialConfidencePercent !== null) {
    showConfidenceMessage("이미 저장된 자신감은 수정할 수 없습니다.", "error");
    return;
  }

  const confidencePercent = getConfidenceValue(initialConfidenceInput.value);

  if (confidencePercent === null) {
    showConfidenceMessage("자신감은 0~100 사이의 정수로 입력해 주세요.", "error");
    initialConfidenceInput.focus();
    return;
  }

  setConfidenceSaving(true);

  try {
    await saveInitialConfidence(confidencePercent);
    lockConfidenceInput(confidencePercent);
  } catch (error) {
    console.error("자신감 저장 실패:", error);

    if (error.code === "permission-denied") {
      showConfidenceMessage("Firestore 권한 문제입니다. 규칙을 확인해 주세요.", "error");
    } else {
      showConfidenceMessage(`자신감 저장 실패: ${error.message}`, "error");
    }

    setConfidenceSaving(false);
  }
}

async function handleAnswerSubmit(event) {
  event.preventDefault();

  if (currentFinalAnswerText !== null) {
    showAnswerMessage("이미 저장된 최종 정답은 수정할 수 없습니다.", "error");
    return;
  }

  const answerText = getFinalAnswerValue(finalAnswerInput.value);

  if (!answerText) {
    showAnswerMessage("최종 정답을 입력해 주세요.", "error");
    finalAnswerInput.focus();
    return;
  }

  setAnswerSaving(true);

  try {
    await saveFinalAnswer(answerText);
    lockFinalAnswerInput(answerText);
  } catch (error) {
    console.error("최종 정답 저장 실패:", error);

    if (error.code === "permission-denied") {
      showAnswerMessage("Firestore 권한 문제입니다. 규칙을 확인해 주세요.", "error");
    } else {
      showAnswerMessage(`최종 정답 저장 실패: ${error.message}`, "error");
    }

    setAnswerSaving(false);
  }
}

function setGaugeValue(value) {
  const safeValue = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

  probabilityGauge.style.setProperty("--probability-fill", `${safeValue}%`);
  probabilityValue.textContent = String(safeValue);
  currentDisplayedProbability = safeValue;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function animateProbabilityTo(targetValue) {
  const target = Math.max(0, Math.min(100, Math.round(Number(targetValue) || 0)));
  const start = currentDisplayedProbability;
  const duration = 950;
  const startTime = performance.now();

  if (gaugeAnimationFrame) {
    cancelAnimationFrame(gaugeAnimationFrame);
  }

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);
    const currentValue = Math.round(start + (target - start) * easedProgress);

    probabilityGauge.style.setProperty("--probability-fill", `${currentValue}%`);
    probabilityValue.textContent = String(currentValue);

    if (progress < 1) {
      gaugeAnimationFrame = requestAnimationFrame(animate);
      return;
    }

    currentDisplayedProbability = target;
    gaugeAnimationFrame = null;
  }

  gaugeAnimationFrame = requestAnimationFrame(animate);
}

function updateProbabilityUI(result) {
  animateProbabilityTo(result.probabilityPercent);
}

async function requestProbabilityFromOpenAI(studentInputText) {
  const response = await fetch("/.netlify/functions/evaluate-probability", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      problemId: PROBLEM_ID,
      problemText: currentProblemText,
      studentInput: studentInputText,
      initialConfidencePercent: currentInitialConfidencePercent,
      finalAnswerText: currentFinalAnswerText
    })
  });

  const responseText = await response.text();

  let data = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    throw new Error(
      `서버 응답을 JSON으로 읽지 못했습니다. 상태 코드: ${response.status}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error || `정답 가능성 계산 요청에 실패했습니다. 상태 코드: ${response.status}`
    );
  }

  return data;
}

async function loadProblem() {
  const problemDocRef = doc(db, "problem", PROBLEM_ID);
  const problemSnap = await getDoc(problemDocRef);

  if (!problemSnap.exists()) {
    currentProblemText =
      "문제를 불러오지 못했습니다. Firestore의 problem/problem1 문서를 확인해 주세요.";
    problemTextElement.textContent = currentProblemText;
    return;
  }

  const problemData = problemSnap.data();
  currentProblemText = problemData.problem || "문제 내용이 비어 있습니다.";
  problemTextElement.textContent = currentProblemText;
}

async function saveConversationLog({ studentInputText, probabilityResult }) {
  const conversationRef = collection(
    db,
    "student",
    currentStudentSession.studentNickname,
    "conversation"
  );

  await addDoc(conversationRef, {
    studentNickname: currentStudentSession.studentNickname,
    problemId: PROBLEM_ID,
    problemText: currentProblemText,

    turnNumber: currentHistoryCount + 1,

    initialConfidencePercent: currentInitialConfidencePercent,
    finalAnswerText: currentFinalAnswerText,

    studentLog: studentInputText,
    studentInput: studentInputText,

    probability: probabilityResult.probability,
    probabilityPercent: probabilityResult.probabilityPercent,

    kcProbabilities: probabilityResult.kcProbabilities,
    probabilityReason: probabilityResult.reason,
    probabilityModelType: probabilityResult.modelType,

    createdAt: serverTimestamp(),
    createdAtLocal: new Date().toISOString()
  });
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderHistory(items) {
  currentHistoryCount = items.length;

  if (items.length === 0) {
    historyList.innerHTML = `<p class="empty-history">아직 저장된 풀이 기록이 없습니다.</p>`;
    return;
  }

  historyList.innerHTML = items
    .map((item, index) => {
      const turnNumber = item.turnNumber || index + 1;
      const probability = item.probabilityPercent ?? 0;
      const confidence = item.initialConfidencePercent;
      const finalAnswer = item.finalAnswerText;
      const createdAtText = formatDateTime(item.createdAtLocal);

      return `
        <article class="history-card">
          <div class="history-card-header">
            <strong>Turn ${turnNumber}</strong>
            <span>${createdAtText}</span>
          </div>

          <p class="student-log">${escapeHtml(item.studentLog || item.studentInput || "")}</p>
          ${
            Number.isInteger(confidence)
              ? `<p>초기 자신감: <strong>${confidence}</strong> / 100</p>`
              : ""
          }
          ${
            typeof finalAnswer === "string" && finalAnswer.trim()
              ? `<p>최종 정답: <strong>${escapeHtml(finalAnswer)}</strong></p>`
              : ""
          }
          <p>정답 가능성: <strong>${probability}</strong> / 100</p>
        </article>
      `;
    })
    .join("");
}

function listenToHistory() {
  const conversationRef = collection(
    db,
    "student",
    currentStudentSession.studentNickname,
    "conversation"
  );

  const historyQuery = query(conversationRef, orderBy("createdAtLocal", "asc"));

  onSnapshot(
    historyQuery,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      renderHistory(items);
    },
    (error) => {
      console.error("히스토리 불러오기 실패:", error);
    }
  );
}

async function handleSolutionSubmit(event) {
  event.preventDefault();

  const inputText = studentInput.value.trim();

  if (currentInitialConfidencePercent === null) {
    showSubmitMessage("먼저 문제를 풀 자신감을 입력하고 저장해 주세요.", "error");
    initialConfidenceInput.focus();
    return;
  }

  if (!inputText) {
    showSubmitMessage("풀이를 입력해 주세요.", "error");
    studentInput.focus();
    return;
  }

  setSubmitting(true);
  showSubmitMessage("");

  try {
    const probabilityResult = await requestProbabilityFromOpenAI(inputText);

    updateProbabilityUI(probabilityResult);

    await saveConversationLog({
      studentInputText: inputText,
      probabilityResult
    });

    showSubmitMessage("풀이와 정답 가능성이 저장되었습니다.", "success");
    studentInput.value = "";
  } catch (error) {
    console.error("풀이 처리 실패:", error);
    showSubmitMessage(`처리 실패: ${error.message}`, "error");
  } finally {
    setSubmitting(false);
  }
}

function openHistoryDrawer() {
  historyDrawer.removeAttribute("inert");
  historyDrawer.setAttribute("aria-hidden", "false");

  historyDrawer.classList.add("open");
  drawerOverlay.classList.add("open");

  closeHistoryButton.focus();
}

function closeHistoryDrawer() {
  if (historyDrawer.contains(document.activeElement)) {
    historyButton.focus();
  }

  historyDrawer.classList.remove("open");
  drawerOverlay.classList.remove("open");

  historyDrawer.setAttribute("aria-hidden", "true");
  historyDrawer.setAttribute("inert", "");
}

async function initPage() {
  currentStudentSession = getStudentSession();

  if (!currentStudentSession || !currentStudentSession.studentNickname) {
    window.location.href = "./index.html";
    return;
  }

  studentNicknameText.textContent = currentStudentSession.studentNickname;

  setGaugeValue(0);

  await loadProblem();
  await loadStudentProblemState();
  listenToHistory();
}

confidenceForm.addEventListener("submit", handleConfidenceSubmit);
answerForm.addEventListener("submit", handleAnswerSubmit);
solutionForm.addEventListener("submit", handleSolutionSubmit);
historyButton.addEventListener("click", openHistoryDrawer);
closeHistoryButton.addEventListener("click", closeHistoryDrawer);
drawerOverlay.addEventListener("click", closeHistoryDrawer);

initPage();